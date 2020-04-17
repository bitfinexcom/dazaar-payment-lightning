const test = require('tape')
const Payment = require('./')

const lndOpts = {
  lnddir: './.lnd',
  rpcPort: 'localhost:11009',
  address: '127.0.0.1:9731',
  network: 'regtest',
  implementation: 'lnd'
}

const cOpts = {
  lightningdDir: '.c',
  address: '127.0.0.1:9733',
  network: 'regtest',
  implementation: 'c-lightning'
}

const paymentCard = {
  payto: 'dazaartest22',
  currency: 'LightningSats',
  amount: '100',
  unit: 'seconds',
  interval: 1
}

var expect = {
  amount: 2000,
  buyer: 'def',
  seller: 'abc'
}

var c
var lnd

test('connect to LND', t => {
  t.doesNotThrow(() => {
    lnd = new Payment({ receive: () => {} }, paymentCard, lndOpts)
  })

  t.deepEqual(lnd.payment, paymentCard)
  t.assert(lnd.destroyed === false)
  t.assert(lnd.lightning)
  t.deepEqual(lnd.subscribers, new Map())
  t.same(lnd.nodeInfo.address, lndOpts.address)

  t.assert(lnd.initMaybe)
  t.assert(lnd.validate)
  t.assert(lnd.connect)
  t.assert(lnd.sell)
  t.assert(lnd.buy)
  t.assert(lnd.pay)
  t.assert(lnd.destroy)
  t.assert(lnd._filter)
  t.assert(lnd._get)
  t.assert(lnd._gc)
  t.assert(lnd._setupExtensions)

  t.ok(Payment.supports({ currency: 'LightningSats' }))
  t.ok(Payment.supports({ currency: 'LightningBTC' }))

  // lightning client
  var lightning = lnd.lightning

  t.assert(lightning.client)
  t.assert(lightning.invoiceStream)
  t.deepEqual(lightning.requests, [])

  t.assert(lightning.getNodeId)
  t.assert(lightning.connect)
  t.assert(lightning.subscription)
  t.assert(lightning.addInvoice)
  t.assert(lightning.payInvoice)

  t.end()
})

test('connect to C-Lightning', t => {
  t.doesNotThrow(() => {
    c = new Payment({ receive: () => {} }, paymentCard, cOpts)
  })

  t.deepEqual(c.payment, paymentCard)
  t.assert(c.destroyed === false)
  t.assert(c.lightning)
  t.deepEqual(c.subscribers, new Map())
  t.same(c.nodeInfo.address, cOpts.address)

  t.assert(c.initMaybe)
  t.assert(c.validate)
  t.assert(c.connect)
  t.assert(c.sell)
  t.assert(c.buy)
  t.assert(c.pay)
  t.assert(c.destroy)
  t.assert(c._filter)
  t.assert(c._get)
  t.assert(c._gc)
  t.assert(c._setupExtensions)

  t.ok(Payment.supports({ currency: 'LightningSats' }))
  t.ok(Payment.supports({ currency: 'LightningBTC' }))

  // lightning client
  var lightning = c.lightning

  t.assert(lightning.client)
  t.deepEqual(lightning.requests, [])

  t.assert(lightning.getNodeId)
  t.assert(lightning.connect)
  t.assert(lightning.subscription)
  t.assert(lightning.addInvoice)
  t.assert(lightning.payInvoice)

  t.end()
})

test('connect clients', t => {
  lnd.initMaybe(function (err) {
    if (err) t.fail()
    t.assert(lnd.nodeInfo.id)
    lnd.lightning.getNodeId(function (err, lndId) {
      if (err) t.fail()
      t.assert(lnd.nodeInfo.id === lndId)
    })

    c.initMaybe(function (err) {
      if (err) t.fail()
      t.assert(c.nodeInfo.id)
      c.lightning.getNodeId(function (err, cId) {
        if (err) t.fail()
        t.assert(c.nodeInfo.id === cId)
      })

      c.connect({ buyerInfo: lnd.nodeInfo }, function (err) {
        if (err) t.fail()

        lnd.lightning.client.listPeers({}, function (err, res) {
          t.assert(res.peers[0].pub_key === c.nodeInfo.id)

          t.end()
        })
      })
    })
  })
})

test('lnd pay c-lightning invoice', t => {
  lnd.lightning.requests.push(expect)
  c.lightning.requests.push(expect)

  lnd.lightning.addInvoice('dazaar:abc def', 2000, function (err, inv) {
    if (err) t.fail()
    c.lightning.payInvoice(inv.request, function (err, paym) {
      if (err) t.fail()

      t.equal(c.lightning.requests.length, 0)
      t.end()
    })
  })
})

test('c-lightning pay lnd invoice', t => {
  c.lightning.addInvoice('dazaar:abc def', 2000, function (err, inv) {
    if (err) t.fail()
    lnd.lightning.payInvoice(inv.request, function (err, paym) {
      if (err) t.fail()

      t.equal(lnd.lightning.requests.length, 0)
      t.end()
    })
  })
})

test('c-lightning payInvoice: wrong label', t => {
  c.lightning.requests.push(expect)

  lnd.lightning.addInvoice('dazaar:def abc', 2000, function (err, inv) {
    if (err) t.fail()
    c.lightning.payInvoice(inv.request, function (err) {
      t.assert(err && err.message === 'unrecognised invoice')

      t.equal(c.lightning.requests.length, 1)
      t.end()
    })
  })
})

test('lnd payInvoice: wrong label', t => {
  lnd.lightning.requests.push(expect)

  c.lightning.addInvoice('dazaar:def abc', 2000, function (err, inv) {
    if (err) t.fail()
    lnd.lightning.payInvoice(inv.request, function (err) {
      t.assert(err)
      
      t.equal(lnd.lightning.requests.length, 1)
      t.end()
    })
  })
})

test('c-lightning payInvoice: wrong amount', t => {
  lnd.lightning.addInvoice('dazaar:abc def', 3000, function (err, inv) {
    if (err) t.fail()
    c.lightning.payInvoice(inv.request, function (err) {
      t.assert(err)
      
      t.equal(c.lightning.requests.length, 1)
      t.end()
    })
  })
})

test('lnd payInvoice: wrong amount', t => {
  c.lightning.addInvoice('dazaar:def abc', 3000, function (err, inv) {
    if (err) t.fail()
    lnd.lightning.payInvoice(inv.request, function (err) {
      t.assert(err)
      
      t.equal(lnd.lightning.requests.length, 1)
      t.end()
    })
  })
})

test('lnd subscription', t => {
  var filter = 'dazaar:abc def'
  var sub = lnd.lightning.subscription(filter, lnd.payment)

  t.notOk(sub.active())
  t.equal(sub.remainingTime(), 0)
  t.equal(sub.remainingFunds(), 0)

  cPayLnd('dazaar:abc def', 2000, function (err) {
    if (err) console.error(err)
    
    t.ok(sub.active())

    var times = []
    var funds = []

    // check time/funds are depleting correctly
    repeat(50, function () {
      var dTime = delta(times)
      var dFunds = delta(funds)

      t.assert(avg(dTime) - 200 < 5)
      t.assert(Math.abs(avg(dFunds) - avg(dTime) / 10) < 0.001)

      t.end()
    })

    function repeat (n, cb) {
      if (!sub.active() || n === 0) return cb() 

      times.push(sub.remainingTime())
      funds.push(sub.remainingFunds())

      return setTimeout(repeat, 200, --n, cb)
    }
  })
})

test('c-lightning subscription', t => {
  var filter = 'dazaar:abc def'
  var sub = c.lightning.subscription(filter, c.payment)

  t.notOk(sub.active())
  t.equal(sub.remainingTime(), 0)
  t.equal(sub.remainingFunds(), 0)

  lndPayC('dazaar:abc def', 2000, function (err) {
    if (err) console.error(err)
    t.ok(sub.active())

    var times = []
    var funds = []

    // check time/funds are depleting correctly
    repeat(50, function () {
      var dTime = delta(times)
      var dFunds = delta(funds)

      t.assert(avg(dTime) - 200 < 5)
      t.assert(Math.abs(avg(dFunds) - avg(dTime) / 10) < 0.01)

      t.end()
    })

    function repeat (n, cb) {
      if (!sub.active() || n === 0) return cb()

      times.push(sub.remainingTime())
      funds.push(sub.remainingFunds())

      return setTimeout(repeat, 200, --n, cb)
    }
  })
})

test('lnd subscription: sync', t => {
  var filter = 'dazaar:early payc'
  c.lightning.requests.push({
    amount: 5000,
    seller: 'early',
    buyer: 'payc'
  })

  cPayLnd(filter, 5000, function (err) {
    if (err) console.error(err)

    var sub = lnd.lightning.subscription(filter, lnd.payment)
    
    // before sync complete
    t.notOk(sub.active())

    // wait for sync
    sub.on('synced', () => {
      t.ok(sub.active())
      t.assert(sub.remainingTime() > 0)
      t.assert(5000 - sub.remainingFunds() < 110)

      t.end()
    })
  })
})

test('c-lightning subscription: sync', t => {
  var filter = 'dazaar:early paylnd'
  lnd.lightning.requests.push({
    amount: 5000,
    seller: 'early',
    buyer: 'paylnd'
  })

  lndPayC(filter, 5000, function (err) {
    if (err) t.fail()

    var sub = c.lightning.subscription(filter, c.payment)

    // before sync complete
    t.notOk(sub.active())

    // wait for sync
    sub.on('synced', () => {
      t.ok(sub.active())
      t.assert(sub.remainingTime() > 0)
      t.assert(sub.remainingFunds() > 0)

      t.end()
    })
  })
})

test('lnd subscription: long sync', t => {
  var filter = 'dazaar:early payc'
  c.lightning.requests.push({
    amount: 20000,
    seller: 'early',
    buyer: 'payc'
  })

  cPayLnd(filter, 20000, function (err) {
    if (err) console.error(err)

    repeat(500, function () { 
      var sub = lnd.lightning.subscription(filter, lnd.payment)
      
      // before sync complete
      t.notOk(sub.active())

      // wait for sync
      sub.on('synced', () => {
        t.ok(sub.active())
        t.assert(sub.remainingTime() > 0)
        t.assert(sub.remainingFunds() > 0)

        t.end()
      })
    })

    function repeat (n, cb) {
      console.log(n)
      if (n === 0) return cb()
      c.lightning.requests.push({
        amount: 10,
        buyer: 'this',
        seller: 'ignore'
      })

      cPayLnd('dazaar:ignore this', 10, (err) => {
        if (err) return console.error(err)
        return setImmediate(repeat, --n, cb)
      })
    }
  })
})

test('c-lightning subscription: long sync', t => {
  var filter = 'dazaar:pay early'
  lnd.lightning.requests.push({
    amount: 20000,
    seller: 'pay',
    buyer: 'early'
  })

  lndPayC(filter, 20000, function (err) {
    if (err) console.error(err)

    repeat(500, function () { 
      var sub = c.lightning.subscription(filter, lnd.payment)
      
      // before sync complete
      t.notOk(sub.active())

      // wait for sync
      sub.on('synced', () => {
        t.ok(sub.active())
        t.assert(sub.remainingTime() > 0)
        t.assert(sub.remainingFunds() > 0)

        t.end()
      })
    })

    function repeat (n, cb) {
      if (n === 0) return cb()
      c.lightning.requests.push({
        amount: 10,
        buyer: 'this',
        seller: 'ignore'
      })

      cPayLnd('dazaar:ignore this', 10, (err) => {
        if (err) return console.error(err)
        return setImmediate(repeat, --n, cb)
      })
    }
  })
})

function delta (arr) {
  return arr.slice(0, arr.length - 1).map((val, i) => val - arr[i + 1])
}

function avg (arr) {
  var sum = arr.reduce((acc, val) => acc + val, 0)
  return sum / arr.length
}

function lndPayC (filter, amount, cb) {
  c.lightning.addInvoice(filter, amount, (err, inv) => {
    if (err) cb(err)
    lnd.lightning.payInvoice(inv.request, (err, paym) => {
      if (err) return cb(err)
      return cb(null, paym)
    })
  })
}

function cPayLnd (filter, amount, cb) {
  lnd.lightning.addInvoice(filter, amount, (err, inv) => {
    if (err) cb(err)
    c.lightning.payInvoice(inv.request, (err, paym) => {
      if (err) return cb(err)
      return cb(null, paym)
    })
  })
}
