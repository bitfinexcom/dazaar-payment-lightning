const lnd = require('./lnd.js')
const metadata = require('../dazaar-payment/metadata')
const { EventEmitter } = require('events')
const cLightning = require('./c-lightning.js')

const MAX_SUBSCRIBER_CACHE = 500

module.exports = class DazaarLightningPayment extends EventEmitter {
  constructor (seller, payment, opts = {}) {
    super()

    this.seller = seller
    this.payment = payment
    this.payments = []
    this.accounts = {}
    this.lightning = node(seller, opts)
    this.subscribers = new Map()
    this.destroyed = false
  }

  init (cb) {
    const self = this
    this.lightning.init(function (err, res) {
      if (err) cb (err)
      self.id = self.lightning.nodeId
      cb(null, res)
    })
  }

  validate (buyer, cb) {
    if (this.destroyed) return process.nextTick(cb, new Error('Seller is shutting down'))
    const tail = this._get(buyer)

    const timeout = setTimeout(ontimeout, 20000)
    let timedout = false
    if (tail.synced || tail.active()) return process.nextTick(onsynced)

    tail.on('synced', onsynced)
    tail.on('update', onupdate)

    function ontimeout () {
      timedout = true
      onsynced()
    }

    function onupdate () {
      if (tail.active()) onsynced()
    }

    function onsynced () {      
      tail.removeListener('synced', onsynced)
      tail.removeListener('update', onupdate)
      clearTimeout(timeout)

      const time = tail.remainingTime()      

      if (time <= 0) return cb(new Error('No time left on subscription' + (timedout ? 'after timeout' : '')))

      cb(null, {
        type: 'time',
        remaining: time
      })
    }
  }

  sell (request, cb) {
    if (!cb) cb = noop
    const self = this
    this.connect(request.id, 'localhost', 9732, function (err, info) {
      if (err) cb(err)
      self.validate(request.id, function (err, res) {
        if (err) cb(err)
        self.lightning.addInvoice(self._filter(request.id), request.amount, function (err, invoice) {
          if (err) self.emit('error', err)
          self.emit('invoice', {
            request: invoice.payment_request,
            amount: request.amount
          })
        })
      })
    })
  }

  // does this need callback?
  buy (seller, amount, rate, cb) {
    if (!cb) cb = console.log
    // requestInovice(amount, function (err, invoice))
     const self = this
     const request = {
      amount,
      id: this.lightning.nodeId
    }

    this.accounts[seller.id] = {
      sent: [],
      maxRate: rate
    }

    self.emit('buy', request)
    cb()
  }
    // seller.push(request)

  

  pay (invoice, sellerId) {
    const self = this
    checkToPay(invoice, sellerId)
    
    function checkToPay (invoice, sellerId) {
      const payments = self.accounts[sellerId]

      const totalPaid = payments.sent.reduce((acc, payment) => {
        return acc + payment.amount
      }, 0)

      const interval = payments.sent.length > 0 ? Date.now() - payments.sent[0].time : Date.now()
      const actualRate = totalPaid / interval

      console.log(actualRate < payments.maxRate)
      if (actualRate < payments.maxRate) return sendPayment()
      
      console.log(actualRate)
      return setTimeout(checkToPay, 500, invoice, sellerId)
    }

    function sendPayment () {
      self.lightning.payInvoice(invoice.request, function (err, payment, time) {
        if (err) return cb(err)
        if (!time) time = Date.now()

        const paid = {
          amount: invoice.amount,
          time
        }
        console.log(paid)

        self.accounts[sellerId].sent.push(paid)
      })
    }
  }

  connect (nodeId, host, port, cb) {
    this.lightning.connect(nodeId, host, port, cb)
  }

  destroy () {
    if (this.destroyed) return
    this.destroyed = true

    for (const tail of this.subscribers.values()) {
      tail.destroy()
    }
  }

  _filter (buyer) {
    return metadata(this.seller, buyer)
  }

  _get (buyer) {
    const h = buyer.toString('hex')
    if (this.subscribers.has(h)) return this.subscribers.get(h)
    if (this.subscribers.size >= MAX_SUBSCRIBER_CACHE) this._gc()

    const self = this
    const tail = this.lightning.subscription(this._filter(buyer), this.payment)
    this.subscribers.set(h, tail)

    tail.on('invoice', function (invoice) {
      self.emit('invoice', invoice)
    })

    return tail
  }

  _gc () {
    for (const [h, tail] of this.subscribers) {
      tail.destroy()
      this.subscribers.delete(h)
      return
    }
  }

  static supports (payment) {
    return payment.currency === 'LightningBTC'
  }
}

function node (seller, opts) {
  if (opts.implementation === 'lnd') return new lnd(seller, opts.rpc)
  if (opts.implementation === 'c-lightning') return new cLightning(seller, opts.rpc)

  throw new Error('unrecognised lightning node: specify lnd or c-lightning.')
}
