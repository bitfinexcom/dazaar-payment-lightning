const Lnd = require('./lnd')
const CLightning = require('./c-lightning')
const metadata = require('./metadata')
const { EventEmitter } = require('events')

const MAX_SUBSCRIBER_CACHE = 500

module.exports = class Payment extends EventEmitter {
  constructor (dazaar, payment, opts = {}) {
    super()
    
    this.dazaar = dazaar
    this.payment = payment

    this.destroyed = false
    this.lightning = node(opts)
    this.subscribers = new Map()

    this.nodeInfo = {}
    this.nodeInfo.address = opts.address
    this.supports = this.constructor.supports

    this._setupExtensions()
  }

  initMaybe (cb) {
    const self = this

    if (this.nodeInfo.id) return cb()

    this.lightning.init((err) => {
      if (err) return cb(err)

      this.lightning.getNodeId(function (err, nodeId) {
        if (err) return cb(err)
        self.nodeInfo.id = nodeId
        cb()
      })
    })
  }

  validate (buyerKey, cb) {
    if (this.destroyed) return process.nextTick(cb, new Error('Seller is shutting down'))

    this.lightning.init((err) => {
      if (err) return cb(err)

      const tail = this._get(buyerKey)

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
    })
  }

  sell (request, buyerKey, cb) {
    if (!cb) cb = noop
    const self = this

    self.lightning.addInvoice(self._filter(buyerKey), request.amount, cb)
  }

  buy (seller, amount, auth, cb) {
    const self = this

    this.initMaybe(oninit)

    function oninit (err) {
      if (err) return cb(err)

      self.dazaar.broadcast('lnd-pay-request', amount)

      cb()
    }
  }

  destroy () {
    if (this.destroyed) return
    this.destroyed = true

    for (const tail of this.subscribers.values()) {
      tail.destroy()
    }

    this.lightning.destroy()
  }

  _filter (key, seller = true) {
    return seller ? metadata(this.dazaar.key, key) : metadata(key, this.dazaar.key)
  }

  _get (buyer) {
    const h = buyer.toString('hex')
    if (this.subscribers.has(h)) return this.subscribers.get(h)
    if (this.subscribers.size >= MAX_SUBSCRIBER_CACHE) this._gc()

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
        if (err) self.emit('error', err)
        self.dazaar.send('lnd-invoice', invoice, stream)
      })
    })

    this.dazaar.receive('lnd-invoice', function (invoice) {
    })
  }

  static supports (payment) {
    const supportedCurrencies = ['LightningBTC', 'LightningSats']
    return supportedCurrencies.includes(payment.currency)
  }
}

function node (opts) {
  if (opts.implementation === 'lnd') return new Lnd(opts)
  if (opts.implementation === 'c-lightning') return new CLightning(opts)

  throw new Error('unrecognised lightning node: specify lnd or c-lightning.')
}

function noop () {}
