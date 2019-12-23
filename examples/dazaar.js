const Lightning = require('./lightning.js')
const lndRpc = require('./lnd-grpc.js')
const hypercore = require('hypercore')
const pump = require('pump')
const market = require('dazaar/market')

const lndOpts2 = {
  lnddir: './.lnd1',
  rpcProtoPath: 'rpc.proto',
  port: 'localhost:13009',
  nodeId: '02451eab8783f22f702ee4e620db480caae44954a2cb436d3b55c81f6678f99d22@localhost:9731',
  network: 'regtest'
}

const lndOpts1 = {
  lnddir: './.lnd',
  rpcProtoPath: __dirname + '/rpc.proto',
  port: 'localhost:12009',
  nodeId: '021cc07997f9684f4963b172e5ab6dfd3b358ecc50fce09fa4703d39b1106f7e37@localhost:9734',
  network: 'regtest'
}

const dazaarParameters = {
  payto: 'dazaartest22',
  currency: 'LightningBTC',
  amount: '0.000002',
  unit: 'hours',
  interval: 1
}

const lightningRpc1 = lndRpc(lndOpts1)
const lightningRpc2 = lndRpc(lndOpts2)

const m = market('./tmp')

const feed = hypercore('./tmp/data')

let sellerLnd
let buyerLnd

feed.append('valuable')

const seller = m.sell(feed, {
  validate (remoteKey, cb) {
    // seller.validate(remoteKey.toString('hex'))
    console.log('this key wants our hypercore', remoteKey)
    sellerLnd.validate(remoteKey, cb)
  }
})

seller.receive('lnd-pay-request', function (request, stream) {
  sellerLnd.sell(request, stream.remotePublicKey, function (err, invoice) {
    if (!err) seller.send('lnd-invoice', invoice)
  })
})

seller.ready(function (err) {
  if (err) throw err // Do proper error handling

  sellerLnd = new Lightning(seller.key.toString('hex'), dazaarParameters, { implementation: 'lnd', rpc: lightningRpc1, nodeInfo: lndOpts1.nodeId })
  buyerLnd = new Lightning(seller.key.toString('hex'), dazaarParameters, { implementation: 'lnd', rpc: lightningRpc2, nodeInfo: lndOpts2.nodeId })

  const buyer = m.buy(seller.key)

  buyer.on('validate', function () {
    console.log('remote validated us')
  })

  buyer.on('valid', console.log)

  buyer.on('feed', function () {
    console.log('got feed!')

    buyer.feed.createReadStream({ live: true })
      .on('data', console.log)
  })

  const stream = seller.replicate()

  pump(stream, buyer.replicate(), stream, function (err) {
    console.log('replication ended', err)
  })

  setImmediate(function () {
    buyer.receive('lnd-invoice', function (invoice) {
      buyerLnd.pay(invoice, { buyer: buyer.key, seller: seller.key, amount: 800 }, function (err) {
        sellerLnd.validate(buyer.key, function (err, info) {
          console.log(err, info)
        })
      })
    })

    const request = buyerLnd.buy(sellerLnd.lightning.nodeId, 800)
    console.log('sending request', request)
    buyer.send('lnd-pay-request', request)
  })
})
