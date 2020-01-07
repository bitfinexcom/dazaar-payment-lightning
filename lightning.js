const lnd = require('./lnd.js')
const metadata = require('../dazaar-payment/metadata')
const { EventEmitter } = require('events')
const cLightning = require('./c-lightning.js')

const MAX_SUBSCRIBER_CACHE = 500

module.exports = class DazaarLightningPayment {
  constructor (sellerKey, payment, opts = {}) {
    this.sellerKey = sellerKey
    this.payment = payment
    this.payments = []
    this.accounts = {}
    this.lightning = node(sellerKey, opts)
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

  sell (request, buyerKey, cb) {
    if (!cb) cb = noop
    const self = this
    this.connect(request.id, function (err, info) {
      if (err && err.code !== 2) return cb(err)
      self.validate(buyerKey, function (err, res) {
        // if (err) return cb(err)
        self.lightning.addInvoice(self._filter(buyerKey), request.amount, cb)
      })
    })
  }

  buy (sellerId, amount) {
    const self = this
    const request = {
      amount,
      id: this.lightning.nodeId,
    }

    return request
  }

  pay (invoice, expected, cb) {
    this.lightning.payInvoice(invoice.request, expected, cb)
  }

  connect (id, cb) {
    this.lightning.connect(id, cb)
  }

  destroy () {
    if (this.destroyed) return
    this.destroyed = true

    for (const tail of this.subscribers.values()) {
      tail.destroy()
    }
  }

  _filter (buyer) {
    return metadata(this.sellerKey, buyer)
  }

  _get (buyer) {
    const h = buyer.toString('hex')
    if (this.subscribers.has(h)) return this.subscribers.get(h)
    if (this.subscribers.size >= MAX_SUBSCRIBER_CACHE) this._gc()

    const self = this
    const tail = this.lightning.subscription(this._filter(buyer), this.payment)
    this.subscribers.set(h, tail)

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

function node (sellerKey, opts) {
  if (sellerKey instanceof Buffer) sellerKey = sellerKey.toString('hex')

  if (opts.implementation === 'lnd') return new lnd(sellerKey, opts.nodeOpts)
  if (opts.implementation === 'c-lightning') return new cLightning(sellerKey, opts.nodeOpts)

  throw new Error('unrecognised lightning node: specify lnd or c-lightning.')
}
