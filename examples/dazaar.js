const Payment = require('../')
const hypercore = require('hypercore')
const pump = require('pump')
const market = require('dazaar/market')

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
  amount: '200',
  unit: 'seconds',
  interval: 1
}

const m = market('./tmp')

const feed = hypercore('./tmp/data1')

let sellerLnd
let buyerLnd

feed.append('valuable')

const seller = m.sell(feed, {
  validate (remoteKey, cb) {
    console.log('this key wants our hypercore: ', remoteKey)
    sellerLnd.validate(remoteKey, cb)
  }
})

seller.ready(function (err) {
  if (err) throw err // Do proper error handling

  const buyer = m.buy(seller.key)

  sellerLnd = new Payment(seller, '200 Sat/s', cOpts)
  buyerLnd = new Payment(buyer, null, lndOpts)

  buyer.on('validate', function () {
    console.log('remote validated us')
  })

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
    // buying flow
    buyerLnd.buy(null, 800, null, repeatBuy(800, 4000))

    // // unrecognised invoice will be rejected
    // setTimeout(() => {
    //   sellerLnd.lightning.addInvoice('dazaar: unrecognised', 800, function (err, invoice) {
    //     if (err) throw err
    //     buyerLnd.pay(invoice, function (err) {
    //       console.error(err)
    //     })
    //   })
    // }, 2000)

    function repeatBuy (amount, interval) {
      return (err) => {
        if (err) throw err
        sellerLnd.validate(buyer.key, function (err, info) {
          console.log(err, info)
          buyerLnd.buy('', amount, '', function (err) {
            if (err) throw err
            setTimeout(repeatBuy(amount, interval), interval)
          })
        })
      }
    }
  })
})
