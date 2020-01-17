# dazaar-lightning
Lightning payment api for Dazaar stream services

## Usage
### Options
```js
const lightningOpts = {
  lnddir: ..., // data directory of the lightning node
  rpcPort: ..., // only needed for LND
  address: ..., // format <host>:<port>
  network: ..., // mainnet / testnet / regtest
  implementation: ... // 'c-lightning' or 'lnd'
}

const paymentCard = {
  payto: 'dazaartest22',
  currency: 'LightningBTC', // may also be LightningSats
  amount: '0.002',
  unit: 'hours',
  interval: 1
}
```

### Seller
```js
const payment = require('dazaar-ln-payment')
const market = require('dazaar/market')
const hypercore = require('hypercore')

const m = market('./tmp')
const feed = hypercore('./tmp/data')

let payee

// instantiate a seller for a feed and equip it
// with a validate function
const seller = m.sell(feed, {
  validate (remoteKey, cb) {
    payee.validate(remoteKey, cb)
  }
})

seller.ready(function (err) {
  payee = new payment.Seller(seller, paymentCard, lightningOpts)
  
  // payment now set up. dazaar logic follows ... 
})
```

### Buyer
On a separate machine with the  
```js
// instantiate a buyer for a specific feed 
const buyer = m.buy(seller.key)

// set up pay payment linked to the buyer
const payer = new payment.Buyer(buyer, lightningOpts)

// buy an amount of feed
payer..buy(800, cb)
```

## API
### Seller
#### `const payee = dazaarLightning.Seller(seller, payment, options)`
Create a new lightning payment instance associated to a seller. `seller` should be a dazaar seller instance, `payment` may either be a dazaar payment card, or a string specifying the per second rate in either `BTC` or `Sats`, such as `200 Sats/s`. Options include:
```js
{
  lnddir: ..., // data directory of the lightning node
  rpcPort: ..., // only needed for LND
  address: ..., // format <host>:<port>
  network: ..., // mainnet / testnet / regtest
  implementation: ... // 'c-lightning' or 'lnd'
}
```

#### `payee.validate(buyerKey, cb)`
A seller can validate the time left for a given buyer. Returns `error` if there is no time left on the subscription. The method shall check whether the given buyer has a subscription set-up and instantiate one not already present.

#### `payee.destroy()`
Destroy the payment provider

### Buyer
#### `const payer = dazaarLightning.Buyer(buyer, options)`
Create a new lightning payment instance associated to a buyer. `buyer` should be a dazaar buyer instance. Options are the same as above.

#### `payer.buy(amount, cb)`
Pay a specified amount for the stream that this buyer is registered to. `amount` is specified in satoshis (1 x 10<sup>-8</sup> BTC). Because a new buyer is instatiated for each stream, there is no need to specify more than the amount to be purchased.

#### `payer.destroy()`
Destroy the payment provider

## Setup

Refer to the [setup guide](SETUP.md) for instructions on how to install a lightning node implementation and set up a test environment.

## License
MIT
