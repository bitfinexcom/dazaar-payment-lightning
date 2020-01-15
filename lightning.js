const lnd = require('./lnd.js')
const metadata = require('../dazaar-payment/metadata')
const { EventEmitter } = require('events')
const cLightning = require('./c-lightning.js')

const MAX_SUBSCRIBER_CACHE = 500

module.exports = class DazaarLightningPayment {
  constructor (dazaar, payment, opts = {}) {
    this.dazaar = dazaar
    this.payment = payment

    this.destroyed = false
    this.lightning = node(opts)
    this.subscribers = new Map()

    this.nodeInfo = {}
    this.nodeInfo.host = opts.info.host

    this._setupExtensions()
  }

  initMaybe (cb) {
    const self = this

    if (this.nodeInfo.id) return cb()

    this.lightning.getNodeId(function (err, nodeId) {
      if (err) return cb(err)
      self.nodeInfo.id = nodeId
      cb()
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
    this.connect(request, function (err, info) {
      if (err && err.code !== 2) return cb(err)
      self.validate(buyerKey, function (err, res) { // validate is called to initiate subscription
        self.lightning.addInvoice(self._filter(buyerKey), request.amount, cb)
      })
    })
  }

  buy (amount, sellerKey, cb) {
    const self = this

    this.initMaybe(oninit)

    function oninit (err) {
      if (err) return cb(err)

      const request = {
        amount,
        buyerInfo: self.nodeInfo,
      }

      const expectedInvoice = {
        amount,
        buyer: self.dazaar.key.toString('hex'),
        seller: sellerKey.toString('hex')
      }

      self.dazaar.send('lnd-pay-request', request)
      self.lightning.requests.push(expectedInvoice)

      cb()
    }
  }

  pay (invoice, expected, cb) {
    this.lightning.payInvoice(invoice.request, expected, cb)
  }

  connect (opts, cb) {
    this.lightning.connect(opts.buyerInfo, cb)
  }

  destroy () {
    if (this.destroyed) return
    this.destroyed = true

    for (const tail of this.subscribers.values()) {
      tail.destroy()
    }
  }

  _filter (buyer) {
    return metadata(this.dazaar.key, buyer)
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

  _setupExtensions () {
    const self = this
    this.dazaar.receive('lnd-pay-request', function (request, stream) {
      self.sell(request, stream.remotePublicKey, function (err, invoice) {
        if (!err) self.dazaar.send('lnd-invoice', invoice)
      })
    })

    this.dazaar.receive('lnd-invoice', function (invoice) {
      self.pay(invoice, function (err, payment) {
        // CHECK: error handling
        if (err) console.error(err)
      })
    })
  }

  static supports (payment) {
    return payment.currency === 'LightningBTC'
  }
}

function node (opts) {
  if (opts.implementation === 'lnd') return new lnd(opts.info)
  if (opts.implementation === 'c-lightning') return new cLightning(opts.info)

  throw new Error('unrecognised lightning node: specify lnd or c-lightning.')
}
