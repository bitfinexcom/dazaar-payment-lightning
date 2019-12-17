const sodium = require('sodium-native')
const { EventEmitter } = require('events')

module.exports = class Payment {
  constructor (sellerAddress, rpc) {
    this.seller = sellerAddress
    this.received = []
    this.outstanding = []
    this.sentPayments = []

    this.client = rpc
    this.users = null
  }

  async init () {
    const self = this

    this.client.listinvoices().then(res => {
      invoices = res.result

      invoices.filter()
    })

    // const invoices = await self.client.listinvoices()
    // const dazaarInvoices = invoices.result.invoices()
    // self.addInvoice('buyer', 2000)
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

    const activePayments = []

    sub.synced = false
    let lastPay
    sync(loop)

    sub.active = function (minSeconds) {
      return sub.remainingFunds(minSeconds) > 0
    }

    sub.destroy = function () {}

    sub.remainingTime = function (minSeconds) {
      const funds = sub.remainingFunds(minSeconds)
      return Math.floor(Math.max(0, funds / perSecond))
    }

    sub.remainingFunds = function (minSeconds) {
      if (!minSeconds) minSeconds = 0

      const now = Math.floor(Date.now() / 1000) + minSeconds 
      const funds = activePayments.reduce(leftoverFunds, 0)
      console.log(activePayments)
      
      return funds

      function leftoverFunds (funds, payment, i) {
        console.log(payment)
        const nextTime = i + 1 < activePayments.length ? activePayments[i + 1].time : now

        const consumed = perSecond * (nextTime - payment.time)
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

          lastPay = Math.max(dazaarPayments.map(inv => inv.pay_index))

          const payments = dazaarPayments.map(payment => ({
            amount: parseInt(payment.masatoshi) / 1000,
            time: parseInt(payment.paid_at)
          }))

          activePayments.concat(payments)

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
        const time = parseInt(invoice.paid_at)

        activePayments.push({ amount: amountSat, time })

        sub.emit('update')

        self.addInvoice(filter, amountSat, function (err, response) {
          // parse invoice
          const invoice = response.result
          loop()
        })
      })
      .catch(console.error)
    }
  }

  async addInvoice (filter, amount, cb) {
    const self = this
    // generate unique label per invoice
    const tag = `${filter}:${Date.now()}`
    const labelBuf = Buffer.alloc(sodium.crypto_generichash_BYTES)
    sodium.crypto_generichash(labelBuf, Buffer.from(tag))
    const label = labelBuf.toString('base64')

    const amountMsat = amount * 1000
    
    return this.client.invoice(amountMsat, label, filter)
      .then(inv => {
        console.log(inv)
        cb(null, inv) })
      .catch(err => cb(err))
  }

  payInvoice(paymentRequest, cb) {
    console.log(paymentRequest)
    const self = this
    if (!cb) cb = noop

    self.client.pay(paymentRequest)
      .then(payment => {
        self.sentPayments.push(payment)
        cb(payment)
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
