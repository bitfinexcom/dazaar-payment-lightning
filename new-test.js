const unixson = require('unixson')
const lightning = require('./lightning.js')
const test = require('tape')
const ptape = require('tape-promise').default
const assert = require('nanoassert')
const lndRpc = require('./lnd-grpc.js')
const grpc = require('grpc')
const ptest = ptape(test)

const lndOpts1 = {
  lnddir: './.lnd',
  rpcProtoPath: 'rpc.proto',
  port: 'localhost:12009',
  network: 'regtest'
}

const lndOpts2 = {
  lnddir: './.lnd1',
  rpcProtoPath: 'rpc.proto',
  port: 'localhost:13009',
  network: 'regtest'
}

const cLightningOpts1 = {
  lightningdPath: './.c1/regtest/lightning-rpc'
}

const cLightningOpts2 = {
  lightningdPath: './.c2/regtest/lightning-rpc'
}

const dazaarParameters = {
  payto: 'dazaartest22',
  currency: 'LightningBTC',
  amount: '0.00002',
  unit: 'hours',
  interval: 1
}

cLightningOpts = {
  lightningdPath: '/Users/chrisdiederichs/clightning/.ln-regtest1/lightning-rpc'
}

eOpts1 = {
  hostname: 'localhost',
  port: 8080,
  path: '/',
  password: 'password'
}

const lightningRpc1 = lndRpc(lndOpts1)
const lightningRpc2 = lndRpc(lndOpts2)

test('set up lnd lightning payment client', t => {
  const pay = new lightning(
    'seller',
    dazaarParameters,
    { implementation: 'lnd', rpc: lightningRpc1}
  )

  t.assert(pay, 'client is created')
  t.assert(pay.validate, 'client has validate method')
  t.assert(pay.buy, 'client has buy method')
  t.assert(pay.destroy, 'client has destroy method')
  t.assert(pay._filter, 'client has _filter method')
  t.assert(pay._get, 'client has _get method')
  t.assert(pay._gc, 'client has _gc method')
  t.assert(lightning.supports(pay.payment), 'btc over lightning supported')
  t.end()
})

test('set up c-lightning lightning payment client', t => {
  const pay = new lightning(
    'seller',
    dazaarParameters,
    { implementation: 'c-lightning', rpc: cLightningOpts1 }
  )

  t.assert(pay, 'client is created')
  t.assert(pay.validate, 'client has validate method')
  t.assert(pay.buy, 'client has buy method')
  t.assert(pay.destroy, 'client has destroy method')
  t.assert(pay._filter, 'client has _filter method')
  t.assert(pay._get, 'client has _get method')
  t.assert(pay._gc, 'client has _gc method')
  t.assert(lightning.supports(pay.payment), 'btc over lightning supported')
  t.end()
})

test('lnd connect', t => {
  const pay1 = new lightning(
    'seller',
    dazaarParameters,
    { implementation: 'lnd', rpc: lightningRpc1 }
  ) 

  const pay2 = new lightning(
    'seller',
    dazaarParameters,
    { implementation: 'lnd', rpc: lightningRpc2 }
  )

  t.assert(pay1, 'client 1 is created')
  t.assert(pay2, 'client 2 is created')

  process.stdin.on('data', listPeers)

  pay1.lightning.client.listPeers({}, function (err, res) {
    if (err) console.error(err)
    console.log(res)
    
    pay1.lightning.client.getInfo({}, function (err, res) {
      if (err) console.error(err)
      console.log(res)

      const nodeId = res.identity_pubkey

      pay2.connect(nodeId, 'localhost', '9731', function (err, response) {
        if (err) console.error(err)
        console.log(response)
      })
    })
  })

  function listPeers () {
    pay1.lightning.client.listPeers({}, function (err, res) {
      if (err) console.error(err)
      console.log(res)
      process.stdin.removeListener('data', listPeers)
      t.end()
    })
  }
})

test('c-lightning connect', t => {
  const c1 = unixson(cLightningOpts1.lightningdPath)
  const c2 = unixson(cLightningOpts2.lightningdPath)

  const pay1 = new lightning(
    'seller',
    dazaarParameters,
    { implementation: 'c-lightning', rpc: c1 }
  ) 

  const pay2 = new lightning(
    'seller',
    dazaarParameters,
    { implementation: 'c-lightning', rpc: c2 }
  )

  t.assert(pay1, 'client 1 is created')
  t.assert(pay2, 'client 2 is created')

  process.stdin.on('data', listPeers)
    console.log('hellooo')

  pay1.lightning.client.listpeers().then(function (err, res) {
    if (err) console.error(err)
    console.log(res)
    
    pay1.lightning.client.getinfo().then(function (res) {
      if (err) console.error(err)
      console.log(res, '_________________________res_______________')

      const nodeId = res.result.id

      pay2.connect(nodeId, 'localhost', '9733', function (err, response) {
        if (err) console.error(err)
        console.log(response)
      })
    })
  })

  function listPeers () {
    pay1.lightning.client.listpeers().then(function (res) {
      console.log(res)
      process.stdin.removeListener('data', listPeers)
      t.end()
    }).catch(err => {
      console.error(err)
      process.stdin.removeListener('data', listPeers)
      t.end()
    })
  }
})

test('pay to lnd', t => {
  const pay1 = new lightning(
    'seller',
    dazaarParameters,
    { implementation: 'lnd', rpc: lightningRpc1 }
  ) 

  const pay2 = new lightning(
    'seller',
    dazaarParameters,
    { implementation: 'lnd', rpc: lightningRpc2 }
  )

  t.assert(pay1, 'client 1 is created')
  t.assert(pay2, 'client 2 is created')

  // pay1.init(function () {
  //   pay1.validate('buyer', function () { console.log('done') })
  //    t.end()
  // })

  process.stdin.on('data', lndTester) 

  function lndTester (data)  {
    console.log(data.toString())
    if (data.toString() === 'end\n') {
      console.log('_____________________________________||||||||||||||||||||___________________________________')
      process.stdin.removeListener('data', lndTester)
      t.end()
    }
    
    if (data.toString().slice(0, 3) === 'add') {
      const amount = data.toString().slice(4, data.byteLength - 1)
      topUp(parseInt(amount))
    }

    pay1.validate('buyer', function (err, info) {
      if (err) console.error(err)
      console.log(info)
    })
  }

  // pay1.validate('buyer', function (err, info) {
  //   if (err) console.error(err)
  //   pay1.lightning.addInvoice('dazaar: seller buyer', 2000, function (err, inv) {
  //     pay2.lightning.payInvoice(inv.payment_request, function (err, payment) {
  //       if (err) console.error(err)
  //     })
  //   })
  // })

  function topUp (amount) {
    pay1.lightning.addInvoice('dazaar: seller buyer', amount, function (err, inv) {
      console.log(err, inv)
      pay2.lightning.payInvoice(inv.payment_request, function (err, payment) {
        if (err) console.error(err)
        console.log(payment)
      })
    })
  }
})

test('pay to c-lightning', t => {
  const c1 = unixson(cLightningOpts1.lightningdPath)
  const c2 = unixson(cLightningOpts2.lightningdPath)

  const pay1 = new lightning(
    'seller',
    dazaarParameters,
    { implementation: 'c-lightning', rpc: c1 }
  ) 

  const pay2 = new lightning(
    'seller',
    dazaarParameters,
    { implementation: 'c-lightning', rpc: c2 }
  )

  t.assert(pay1, 'client 1 is created')
  t.assert(pay2, 'client 2 is created')

  // pay1.init(function () {
  //   pay1.validate('buyer', function () { console.log('done') })
  //    t.end()
  // })
  process.stdin.on('data', function (data) {
    if (data.toString() === 'end\n') t.end()
    
    if (data.toString().slice(0, 3) === 'add') {
      const amount = data.toString().slice(4, data.byteLength - 1)
      topUp(parseInt(amount))
    }

    pay1.validate('buyer', function (err, info) {
      if (err) console.error(err)
      console.log(info)
    })
  })

  // pay1.validate('buyer', function (err, info) {
  //   if (err) console.error(err)
  //   pay1.lightning.addInvoice('dazaar: seller buyer', 2000, function (err, inv) {
  //     pay2.lightning.payInvoice(inv.payment_request, function (err, payment) {
  //       if (err) console.error(err)
  //     })
  //   })
  // })

  function topUp (amount) {
    pay1.lightning.addInvoice('dazaar: seller buyer', amount, function (err, res) {
      console.log(res)
      pay2.lightning.payInvoice(res.result.bolt11, function (err, payment) {
        if (err) console.error(err)
        console.log(payment)
      })
    })
  }
})

test.only('lnd buy method', t => {
  const pay1 = new lightning(
    'seller',
    dazaarParameters,
    { implementation: 'lnd', rpc: lightningRpc1 }
  ) 

  const pay2 = new lightning(
    'seller',
    dazaarParameters,
    { implementation: 'lnd', rpc: lightningRpc2 }
  )

  t.assert(pay1, 'client 1 is created')
  t.assert(pay2, 'client 2 is created')

  // pay1.init(function () {
  //   pay1.validate('buyer', function () { console.log('done') })
  //    t.end()
  // })

  pay1.init(function (err, info) {
    pay1.validate('buyer', function (err, info) {
      if (err) console.error(err)
      console.log('______________________________________________')
      pay2.buy(pay1, 800, 0.1, function (err, res) {
        console.log(res)
      console.log('______________________________________________')

        pay1.lightning.addInvoice('dazaar: seller buyer', 1000, function (err, invoice) {
          console.log(err, invoice)
          if (err) pay1.emit('error', err)
          console.log('______________________________________________')
          pay1.emit('invoice', {
            request: invoice.payment_request,
            amount: 200
          })
        })
      })
    })
  })

  process.stdin.on('data', lndTester) 

  function lndTester (data)  {
    console.log(data.toString())
    if (data.toString() === 'end\n') {
      console.log('_____________________________________||||||||||||||||||||___________________________________')
      process.stdin.removeListener('data', lndTester)
      t.end()
    }
    
    if (data.toString().slice(0, 3) === 'add') {
      const amount = data.toString().slice(4, data.byteLength - 1)
      topUp(parseInt(amount))
    }

    pay1.validate('buyer', function (err, info) {
      if (err) console.error(err)
      console.log(info)
    })
  }
})

  // pay1.validate('buyer', function (err, info) {
  //   if (err) console.error(err)

  //   pay1.lightning.addInvoice('dazaar: seller buyer', 2000, function (err, res) {
  //     if (err) {
  //       console.error(err)
  //       return
  //     }

  //     const invoice = res.result

  //     pay2.lightning.payInvoice(invoice.bolt11, function (err, payment) {
  //       if (err) console.error(err)

  //       pay1.validate('buyer', function (err, info) {
  //         if (err) console.error(err)
  //         console.log(info)

  //         setTimeout(() => {
  //           pay1.validate('buyer', (err, info) => {
  //             if (err) console.error(err)
  //             console.log(info)

  //             pay1.destroy()
  //             pay2.destroy()
  //             t.end()
  //           })
  //         }, 2000)
  //       })
  //     })
  //   })
  // })



