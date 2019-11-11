// const Payment = require('./lightning.js')
// const cLightning = require('./clightning-plugin.js')
const e = require('./eclair.js')
const test = require('tape')
const ptape = require('tape-promise').default
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
// const pay = new Payment ('seller', ['buyer'], lndOpts)
// const epay1 = new eclair('seller1', ['buyer'], eclairOpts1)
// const epay2 = new eclair('seller2', ['buyer'], eclairOpts2)
const nodeId = 'lnbcrt1u1pwmnlggpp5xvukq330v45jwg803mzppw4p7malfnhullzx9je6qpuyz04lem3sdq2v3sh5ctpwgxqrrssn9h9aedr8l2wnknhssemm2zfvpc2fkxv7rz4x784yqxtegm52p496xn5mdwttgyyrdnn95gpndfvmw5pm9cqaczhjw6sgjshtthxjhcpgu686n'

ptest('eclair nodes connecting and pay eachother', async t => {
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
})

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
