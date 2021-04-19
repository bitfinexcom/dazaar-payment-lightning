const LndGrpc = require('lnd-grpc')
const lndconnect = require('lndconnect')
const clerk = require('payment-tracker')
const { EventEmitter } = require('events')
const assert = require('assert')

process.env.GRPC_SSL_CIPHER_SUITES = 'HIGH+ECDSA'

module.exports = class Payment extends EventEmitter {
  constructor (opts) {
    super()

    opts.lndconnectUri = lndconnect.encode({
      cert: Buffer.from(opts.cert, 'base64'),
      macaroon: Buffer.from(opts.macaroon, 'base64'),
      host: opts.host
    })

    this.client = new LndGrpc(opts)
    this.invoiceStream = null

    this.initialized = null

    this.Invoices = null
    this.Lightning = null
    this.WalletUnlocker = null

    this.requests = []
    this._reset(opts)
  }

  _reset (opts) {
    this.client.on('locked', async () => {
      const password = await opts.unlock()
      await this.unlock(password)
    })

    this.client.on('error', console.log)

    this.client.once('disconnected', () => {
      this.client = new LndGrpc(opts)
      this.initialized = null
      this._reset(opts)
    })
  }

  async _init () {
    await this.client.connect()

    const { Lightning, Invoices, WalletUnlocker } = this.client.services

    this.Invoices = Invoices
    this.Lightning = Lightning
    this.WalletUnlocker = WalletUnlocker

    await this._connectInvoiceStream()
  }

  async _connectInvoiceStream () {
    try {
      this.invoiceStream = await this.Lightning.subscribeInvoices({})
    } catch (e) {
      setTimeout(() => this._connectInvoiceStream(), 5000)
      return
    }

    this.invoiceStream.on('error', console.error)
    this.invoiceStream.on('data', data => {
      this.emit('live-invoice', data)
    })

    this.invoiceStream.on('end', () => {
      setTimeout(() => this._connectInvoiceStream(), 5000)
    })
  }

  async init (cb) {
    if (!this.initialized) this.initialized = this._init()

    try {
      await this.initialized
    } catch (err) {
      return process.nextTick(cb, err)
    }

    process.nextTick(cb, null)
  }

  async unlock (password) {
    assert(this.client.state === 'locked', 'expected wallet to be locked')

    await this.WalletUnlocker.unlockWallet({
      wallet_password: Buffer.from(password)
    })

    return this.WalletUnlocker.activateLightning()
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

    self.on('live-invoice', filterInvoice)

    sub.active = account.active
    sub.remainingTime = account.remainingTime
    sub.remainingFunds = account.remainingFunds

    sub.destroy = function () {
      account = null
      self.removeListener('live-invoice', filterInvoice)
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

        dazaarPayments.forEach(payment =>
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
      value: amount,
      private: true
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
    if (!cb) cb = noop

    const call = this.Lightning.sendPayment()

    call.write({
      payment_request: paymentRequest.request
    })

    call.on('data', function (payment) {
      if (payment.payment_error === '') return cb(null, payment)
      return cb(new Error(payment.payment_error))
    })
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

  if (pay.currency.toUpperCase() === 'SATS') satoshiAmt = Number(pay.amount)
  if (pay.currency.toUpperCase() === 'BTC') satoshiAmt = toSats(Number(pay.amount))

  const perSecond = satoshiAmt / (Number(pay.interval) * ratio)
  if (!perSecond) throw new Error('Invalid payment info')

  return perSecond
}

function toSats (btcAmount) {
  return btcAmount * 10 ** 8
}
