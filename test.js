const lnd = require('./lightning.js')
const cLightning = require('./c-lightning.js')
const e = require('./eclair.js')
const test = require('tape')
const ptape = require('tape-promise').default
const assert = require('nanoassert')
const ptest = ptape(test)

lndOpts = {
  tlsCertPath: '../lightning-test/.lnd1/tls.cert',
  rpcProtoPath: 'rpc.proto',
  port: 'localhost:10009'
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

// const cpay = new cLightning('seller', ['buyer'], cLightningOpts)
// const pay = new lnd ('seller', ['buyer'], lndOpts)
// const epay1 = new eclair('seller1', ['buyer'], eclairOpts1)
// const epay2 = new eclair('seller2', ['buyer'], eclairOpts2)
const nodeId = 'lnbcrt1u1pwmnlggpp5xvukq330v45jwg803mzppw4p7malfnhullzx9je6qpuyz04lem3sdq2v3sh5ctpwgxqrrssn9h9aedr8l2wnknhssemm2zfvpc2fkxv7rz4x784yqxtegm52p496xn5mdwttgyyrdnn95gpndfvmw5pm9cqaczhjw6sgjshtthxjhcpgu686n'

ptest.skip('eclair nodes connecting and pay eachother', async t => {
  const eOpts2 = {
    hostname: 'localhost',
    port: 8081,
    path: '/',
    password: 'password'
  }
  
  const e1 = new e('seller1', ['buyer'], eOpts1)
  const e2 = new e('seller2', ['buyer'], eOpts2)

  await Promise.all([
    e1.init(),
    e2.init()
  ])

  e2.connect('039fb7bc7698af62142d235445082615b8045ac9f30d6274bfe61a590c684022d1@localhost:8081')
    .then(e2.listPeers)
    .then(console.log)
  // e2.getInfo().then(console.log)

  // console.log(e2info)
  // e1.connect(`${e2info.nodeId}@${eOpts2.hostname}:${eOpts2.port}`).then(function() {
  //   e1.listPeers().then(console.log)
  // })


  // console.log(e1info, 'e1')
  // console.log(e2info, 'e2')

  // process.stdin.on('data', function (data) {
  //   e.addInvoice('buyer', parseInt(data))
  // })
  ptest.end()
})

ptest('create lnd client', async t => {
  lndOpts = {
    lnddir: './.lnd',
    rpcProtoPath: 'rpc.proto',
    port: 'localhost:12009',
    network: 'regtest'
  }

  const pay = new lnd('seller', ['buyer'], lndOpts)

  // await pay.init()
  t.assert(pay, 'client is created')
  t.deepEqual(pay.seller, 'seller', 'seller address correctly loaded')
  t.deepEqual(pay.users, ['buyer'], 'users correctly loaded')
  t.assert(pay.addInvoice, 'addInvoice method exists')
  t.assert(pay.validate, 'validate method exists')
  t.assert(pay.payInvoice, 'payInvoice method exists')
  t.assert(pay.earnings, 'earnings method exists')

  t.end()
})

ptest('create c-lightning client', async t => {
  cLightningOpts = {
    lightningdPath: './.c-lightning-regtest/lightning-rpc'
  }

  const cpay = new cLightning('seller', ['buyer'], cLightningOpts)

  await cpay.init()

  t.assert(cpay, 'client is created')
  t.deepEqual(cpay.seller, 'seller', 'seller address correctly loaded')
  t.deepEqual(cpay.users, ['buyer'], 'users correctly loaded')
  t.assert(cpay.addInvoice, 'addInvoice method exists')
  t.assert(cpay.validate, 'validate method exists')
  t.assert(cpay.payInvoice, 'payInvoice method exists')
  t.assert(cpay.earnings, 'earnings method exists')

  t.end()
})

ptest('lnd -> lnd dazaar payment', async t => {
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

  const sellerId = 'seller'
  const buyerId = 'buyer'

  const lndPay1 = new lnd(sellerId, [buyerId], lndOpts1)
  const lndPay2 = new lnd(sellerId, [buyerId], lndOpts2)

  await Promise.all([
    lndPay1.init(),
    lndPay2.init()
  ])

  const invoice = await lndPay1.addInvoice(buyerId, 2000)

  t.assert(lndPay1.outstanding.length === 1)
  t.deepEqual(lndPay1.outstanding[0], invoice)

  await lndPay2.payInvoice(invoice.payment_request)
  await delay(200)

  t.assert(lndPay1.outstanding.length === 0)
  // setTimeout(() => console.log(lndPay1.validate(0.2, buyerId)), 1000)
  const timeLeft  = []

  timeLeft.push(lndPay1.validate(2, buyerId))
  await delay(200)
  timeLeft.push(lndPay1.validate(2, buyerId))

  t.assert(timeLeft[1] > 0)
  t.assert(timeLeft[0] > timeLeft[1])

  await delay(100)
  t.end()
})

ptest('c-lightning -> c-lightning dazaar payment', async t => {
  const cLightningOpts1 = {
    lightningdPath: './.c-lightning-regtest/lightning-rpc'
  }

  const cLightningOpts2 = {
    lightningdPath: './.c-lightning-regtest1/lightning-rpc'
  }

  const sellerId = 'seller'
  const buyerId = 'buyer'

  const cPay1 = new cLightning(sellerId, [buyerId], cLightningOpts1)
  const cPay2 = new cLightning(sellerId, [buyerId], cLightningOpts2)

  await Promise.all([
    cPay1.init(),
    cPay2.init()
  ])

  const invoice = await cPay1.addInvoice(buyerId, 2000)

  t.assert(cPay1.outstanding.length === 1)
  t.deepEqual(cPay1.outstanding[0], invoice)

  await cPay2.payInvoice(invoice.bolt11)
  await delay(200)

  t.assert(cPay1.outstanding.length === 0)
  // setTimeout(() => console.log(cPay1.validate(0.2, buyerId)), 1000)
  const timeLeft  = []

  timeLeft.push(cPay1.validate(2, buyerId))
  await delay(200)
  timeLeft.push(cPay1.validate(2, buyerId))

  t.assert(timeLeft[1] > 0)
  t.assert(timeLeft[0] > timeLeft[1])

  await delay(100)
  t.end()
})


ptest('lnd -> c-lightning dazaar payment', async t => {
  const lndOpts = {
    lnddir: './.lnd',
    rpcProtoPath: 'rpc.proto',
    port: 'localhost:12009',
    network: 'regtest'
  }

  const cLightningOpts = {
    lightningdPath: './.c-lightning-regtest/lightning-rpc'
  }

  const sellerId = 'seller'
  const buyerId = 'buyer'

  const cpay = new cLightning(sellerId, [buyerId], cLightningOpts)
  const pay = new lnd (sellerId, [buyerId], lndOpts)

  await Promise.all([
    pay.init(),
    cpay.init()
  ])

  const invoice = await cpay.addInvoice(buyerId, 2000)

  t.assert(cpay.outstanding.length === 1)
  t.deepEqual(cpay.outstanding[0], invoice)

  await pay.payInvoice(invoice.bolt11)
  await delay(200)

  t.assert(cpay.outstanding.length === 0)
  // setTimeout(() => console.log(cpay.validate(0.2, buyerId)), 1000)
  const timeLeft  = []

  timeLeft.push(cpay.validate(2, buyerId))
  await delay(200)
  timeLeft.push(cpay.validate(2, buyerId))

  t.assert(timeLeft[1] > 0)
  t.assert(timeLeft[0] > timeLeft[1])

  await delay(100)
  t.end()
})

ptest('c-lightning -> lnd dazaar payment', async t => {
  const lndOpts = {
    lnddir: './.lnd',
    rpcProtoPath: 'rpc.proto',
    port: 'localhost:12009',
    network: 'regtest'
  }

  const cLightningOpts = {
    lightningdPath: './.c-lightning-regtest/lightning-rpc'
  }

  const sellerId = 'seller'
  const buyerId = 'buyer'

  const cpay = new cLightning(sellerId, [buyerId], cLightningOpts)
  const pay = new lnd (sellerId, [buyerId], lndOpts)

  await Promise.all([
    pay.init(),
    cpay.init()
  ])

  const invoice = await pay.addInvoice(buyerId, 2000)

  t.assert(pay.outstanding.length === 1)
  t.deepEqual(pay.outstanding[0], invoice)

  await cpay.payInvoice(invoice.payment_request)
  await delay(200)

  t.assert(pay.outstanding.length === 0)
  // setTimeout(() => console.log(pay.validate(0.2, buyerId)), 1000)
  const timeLeft  = []

  timeLeft.push(pay.validate(2, buyerId))
  await delay(200)
  timeLeft.push(pay.validate(2, buyerId))

  t.assert(timeLeft[1] > 0)
  t.assert(timeLeft[0] > timeLeft[1])

  await delay(100)
  t.end()
})

// helper
function delay (time) {
  assert(typeof time === 'number')
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve()
    }, time)
  })
}

  // cpay.init().then(() => {
  //   process.stdin.on('data', function (data) {
  //     if (data.toString() === 'validate\n') { 
  //       console.log(cpay.validate(20, 'buyer'))
  //     } else if (data.toString() === 'earnings\n') {
  //       console.log(cpay.earnings())
  //     } else {
  //       cpay.addInvoice('buyer', parseInt(data))
  //     }
  //   })
  // })

// pay.init().then(() => {
//   process.stdin.on('data', function (data) {
//     if (data.toString() === 'validate\n') { 
//       console.log(pay.validate(20, 'buyer'))
//     } else if (data.toString() === 'earnings\n') {
//       console.log(pay.earnings())
//     } else {
//       pay.addInvoice('buyer', parseInt(data))
//     }
//   })
// })
