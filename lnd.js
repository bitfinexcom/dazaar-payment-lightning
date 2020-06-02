const LndGrpc = require('lnd-grpc')
const clerk = require('payment-tracker')
const { EventEmitter } = require('events')

process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA'

module.exports = class Payment {
  constructor (opts) {
    this.client = new LndGrpc(opts)
    this.invoiceStream = null

    this.initialized = false

    this.Invoices = null
    this.Lightning = null
    this.WalletUnlocker = null

    this.requests = []

    this.client.on('locked', async () => {
      const password = await opts.unlock()
      await this.unlock(password)
    })
  }

  async _init (cb) {
    await this.client.connect()

    const { Lightning, Invoices, WalletUnlocker } = this.client.services

    this.Invoices = Invoices
    this.Lightning = Lightning
    this.WalletUnlocker = WalletUnlocker

    this.invoiceStream = await this.Lightning.subscribeInvoices({})

    cb()
  }

  init (cb) {
    if (this.initialized) return this.initialized
    this.initialized =  this._init(cb)
  }

  async unlock (password) {
    assert(this.client.state === 'locked', 'expected wallet to be locked')

    await WalletUnlocker.unlockWallet({
      wallet_password: Buffer.from(password)
    })

    return WalletUnlocker.activateLightning()
  }

  getNodeId (cb) {
    this.Lightning.getInfo({}, function (err, res) {
      if (err) return cb(err)
      cb(null, res.identity_pubkey)
    })
  }

  destroy () {
    this.requests = []
    this.client.disconnect()
  }

  connect (opts, cb) {
    const self = this

    this.Lightning.listPeers({}, function (err, res) {
      if (err) return cb(err)

      if (res.peers.findIndex(peer => peer.pub_key === opts.id) >= 0) return cb()

      const nodeAddress = {
        pubkey: opts.id,
        host: opts.address
      }

      const request = {
        addr: nodeAddress,
        perm: true
      }

      self.Lightning.connectPeer(request, cb)
    })
  }

  subscription (filter, paymentInfo) {
    const self = this
    let perSecond = 0

    if (typeof paymentInfo === 'object' && paymentInfo) { // dazaar card
      perSecond = convertDazaarPayment(paymentInfo)
    } else {
      try {
        const match = paymentInfo.trim().match(/^(\d(?:\.\d+)?)\s*BTC\s*\/\s*s$/i)
        if (!match) throw new Error()
        perSecond = Number(match[1]) * 10 ** 8
      } catch {
        const match = paymentInfo.trim().match(/^(\d+)(?:\.\d+)?\s*Sat\/\s*s$/i)
        if (!match) throw new Error('rate should have the form "n....nn Sat/s" or "n...nn BTC/s"')
        perSecond = Number(match[1])
      }
    }

    const sub = new EventEmitter()

    let account = clerk(perSecond, paymentInfo.minSeconds, paymentInfo.paymentDelay)

    sub.synced = false
    sync()

    self.invoiceStream.on('data', filterInvoice)

    sub.active = account.active
    sub.remainingTime = account.remainingTime
    sub.remainingFunds = account.remainingFunds

    sub.destroy = function () {
      account = null
      sub.removeListener('data', filterInvoice)
    }

    return sub

    function filterInvoice (invoice) {
      if (invoice.memo !== filter || !invoice.settled) return

      const amount = parseInt(invoice.value)
      const time = parseInt(invoice.settle_date) * 1000

      account.add({ amount, time })

      sub.emit('update')
    }

    function sync () {
      // make sure to sync all invoices
      var num_max_invoices = Number.MAX_SAFE_INTEGER
      var reversed = true

      self.Lightning.listInvoices({ num_max_invoices, reversed }, function (err, res) {
        // CHECK: error handling
        if (err) {
          sub.destroy()
          sub.emit('warning', err)
          return
        }

        const dazaarPayments = res.invoices
          .filter(invoice => invoice.settled && invoice.memo === filter)

        const payments = dazaarPayments.forEach(payment => 
          account.add({
            amount: parseInt(payment.value),
            time: parseInt(payment.settle_date) * 1000
          }))

        sub.synced = true
        sub.emit('synced')
      })
    }
  }

  addInvoice (filter, amount, cb) {
    if (!cb) cb = noop

    this.Lightning.addInvoice({
      memo: filter,
      value: amount
    }, function (err, res) {
      if (err) return cb(err)

      const invoice = {
        request: res.payment_request,
        amount: amount
      }

      cb(null, invoice)
    })
  }

  payInvoice (paymentRequest, cb) {
    const self = this
    if (!cb) cb = noop

    this.Lightning.decodePayReq({
      pay_req: paymentRequest
    }, function (err, details) {
      if (err) return cb(err)

      // invoice verification logic
      const [label, info] = details.description.split(':')

      if (label !== 'dazaar') return fail()

      const [seller, buyer] = info.trim().split(' ')

      const invoice = {
        buyer,
        seller,
        amount: parseInt(details.num_satoshis)
      }

      const index = self.requests.findIndex(matchRequest(invoice))
      if (index === -1) return fail()

      self.requests.splice(index, 1)

      const call = self.Lightning.sendPayment()
      call.write({
        payment_request: paymentRequest
      })

      call.on('data', function (payment) {
        if (payment.payment_error === '') return cb(null, payment)
        return cb(new Error(payment.payment_error))
      })
    })

    function fail () {
      return cb(new Error('unrecognised invoice'))
    }

    function matchRequest (inv) {
      return req => {
        return req.buyer === inv.buyer &&
          req.seller === inv.seller &&
          req.amount === inv.amount
      }
    }
  }

  earnings () {
    const earnings = {}
    for (const user of this.users) {
      earnings[user] = this.settled.reduce(function (acc, payment) {
        if (payment.ref.split(':')[1] !== user) return acc
        return acc + payment.amount
      }, 0)
    }
    return earnings
  }
}

function noop () {}

function convertDazaarPayment (pay) {
  let ratio = 0

  switch (pay.unit) {
    case 'minutes':
      ratio = 60
      break
    case 'seconds':
      ratio = 1
      break
    case 'hours':
      ratio = 3600
      break
  }

  let satoshiAmt

  if (pay.currency === 'LightningSats') satoshiAmt = Number(pay.amount)
  if (pay.currency === 'LightningBTC') satoshiAmt = toSats(Number(pay.amount))

  const perSecond = satoshiAmt / (Number(pay.interval) * ratio)
  if (!perSecond) throw new Error('Invalid payment info')

  return perSecond
}

function toSats (btcAmount) {
  return btcAmount * 10 ** 8
}
