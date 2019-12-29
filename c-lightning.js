const sodium = require('sodium-native')
const { EventEmitter } = require('events')

module.exports = class Payment {
  constructor (sellerAddress, rpc) {
    this.seller = sellerAddress
    this.received = []
    this.outstanding = []
    this.sentPayments = []

    this.nodeId = null
    this.client = rpc
    this.users = null
  }

  async init (cb) {
    const self = this

    this.client.getinfo()
      .then(function (res) {
      self.nodeId = res.result.id
        cb()
      })
      .catch(err => cb(err))
  }

  connect (nodeId, host, port, cb) {
    const self = this

    this.client.listpeers()
      .then(res => {
        const peers = res.result.peers

        if (peers.indexOf(peer => peer.pub_key = nodeId) >= 0) return cb()

        self.client.connect(nodeId, host, port)
          .then(res => cb(null, res))
          .catch(err => cb(err))
      })
      .catch(err => cb(err))
  }

  subscription (filter, rate) {
    const self = this
    let perSecond = 0

     if (typeof rate === 'object' && rate) { // dazaar card
      perSecond = convertDazaarPayment(rate)
    } else {
      const match = rate.trim().match(/^(\d(?:\.\d+)?)\s*BTC\s*\/\s*s$/i)
      if (!match) throw new Error('rate should have the form "n....nn BTC/s"')
      perSecond = Number(match[1])
    }

    const sub = new EventEmitter()

    let activePayments = []

    sub.synced = false
    let lastPay
    sync(loop)

    sub.active = function (minSeconds) {
      return sub.remainingFunds(minSeconds) > 0
    }

    sub.destroy = function () {}

    sub.remainingTime = function (minSeconds) {      
      const funds = sub.remainingFunds(minSeconds)
      return Math.floor(Math.max(0, funds / perSecond * 1000))
    }

    sub.remainingFunds = function (minSeconds) {
      if (!minSeconds) minSeconds = 0

      const now = Date.now() + minSeconds * 1000 
      const funds = activePayments.reduce(leftoverFunds, 0)
      
      return funds

      function leftoverFunds (funds, payment, i) {
        const nextTime = i + 1 < activePayments.length ? activePayments[i + 1].time : now

        const consumed = perSecond * (nextTime - payment.time) / 1000
        funds += fromSats(payment.amount) - consumed

        return funds > 0 ? funds : 0
      }
    }

    return sub

    function sync (cb) {
      self.client.listinvoices()
        .then(res => {
          const dazaarPayments = res.result.invoices
            .filter(invoice => invoice.status === 'paid' && invoice.description === filter)

          lastPay = Math.max(...dazaarPayments.map(inv => inv.pay_index)) - 1

          const payments = dazaarPayments.map(payment => ({
            amount: payment.msatoshi / 1000,
            time: parseInt(payment.paid_at) * 1000
          }))

          activePayments = [].concat(activePayments, payments)

          sub.synced = true
          sub.emit('synced')
          cb()
        })
        .catch(console.error)
    }

    function loop (err) {
      if (err) {
        console.error(err)
        return
      }

      self.client.waitanyinvoice(lastPay).then(function (res) {
        const invoice = res.result
        lastPay = invoice.pay_index

        if (invoice.memo !== filter || invoice.status !== 'paid') loop()

        const amountSat = parseInt(invoice.msatoshi) / 1000
        const time = parseInt(invoice.paid_at) * 1000
        const hash = invoice.payment_hash        

        activePayments.push({ amount: amountSat, time, hash })

        sub.emit('update')

        self.addInvoice(filter, amountSat, function (err, response) {
          // parse invoice
          const invoice = response.result          
        })
      })
      .catch(console.error)
    }
  }

  addInvoice (filter, amount, cb) {
    const self = this
    // generate unique label per invoice
    const tag = `${filter}:${Date.now()}`
    const labelBuf = Buffer.alloc(sodium.crypto_generichash_BYTES)
    sodium.crypto_generichash(labelBuf, Buffer.from(tag))
    const label = labelBuf.toString('base64')

    const amountMsat = amount * 1000
    
    return this.client.invoice(amountMsat, label, filter)
      .then(inv => {
        cb(null, inv) })
      .catch(err => cb(err))
  }

  payInvoice(paymentRequest, cb) {
    // console.log(paymentRequest)
    const self = this
    if (!cb) cb = noop    

    self.client.pay(paymentRequest)
      .then(payment => {
        if (payment.error) return cb(new Error(payment.error.message))

        cb(null, payment, Date.now())
      })
      .catch(err => cb(err))
  }

  earnings () {
    const earnings = {}
    for (let user of this.users) {
      earnings[user] = this.received.reduce(function (acc, payment) {
        if (payment.ref.split(':')[1] !== user) return acc
        return acc + payment.amount
      }, 0)
    }
    return earnings
  }
}

function noop () {}

function toSats (btcAmount) {
  return btcAmount * 10 ** 8
}

function fromSats (btcAmount) {
  return btcAmount / 10 ** 8
}

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

  const perSecond = Number(pay.amount) / (Number(pay.interval) * ratio)
  if (!perSecond) throw new Error('Invalid payment info')

  return perSecond
}
