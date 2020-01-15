# dazaar-lightning
lightning payment api for dazaar stream services

## Install c-lightning

 Install c-lightning from source using the following instructions taken from the c-lightning [INTALL.md] (https://github.com/ElementsProject/lightning/blob/master/doc/INSTALL.md):

Install dependencies: 

```
$ brew install autoconf automake libtool python3 gmp gnu-sed gettext libsodium
$ ln -s /usr/local/Cellar/gettext/0.20.1/bin/xgettext /usr/local/opt
$ export PATH="/usr/local/opt:$PATH"
```

If you need SQLite:

```
$ brew install sqlite
$ export LDFLAGS="-L/usr/local/opt/sqlite/lib"
$ export CPPFLAGS="-I/usr/local/opt/sqlite/include"
```

If you need Python 3.x for mako:

```
$ brew install pyenv
$ echo -e 'if command -v pyenv 1>/dev/null 2>&1; then\n  eval "$(pyenv init -)"\nfi' >> ~/.bash_profile
$ source ~/.bash_profile
$ pyenv install 3.7.4
$ pip install --upgrade pip
```

If you don't have bitcoind installed locally you'll need to install that as well:

```
$ brew install berkeley-db4 boost miniupnpc pkg-config libevent
$ git clone https://github.com/bitcoin/bitcoin
$ cd bitcoin
$ ./autogen.sh
$ ./configure
$ make src/bitcoind src/bitcoin-cli && make install
```

Clone lightning:

```
$ git clone https://github.com/ElementsProject/lightning.git
$ cd lightning
```

Configure Python 3.x & get mako:

```
$ pyenv local 3.7.4
$ pip install mako
```

Build lightning:

```
$ ./configure
$ make
```

## Setup Nodes

Start c-lightning daemon:

```
./lightning/lightningd/lightningd --lightning-dir=$PWD/dazaar/lightning/.c2 --bitcoin-rpcuser=lnd --bitcoin-rpcpassword=password --network=regtest --log-level=debug --daemon --addr=localhost:9732
```

Set alias for c-lightning cli:

```
alias c1-cli="$HOME/lightning/cli/lightning-cli --lightning-dir=$HOME/dazaar/lightning/.c1 --network=regtest"
```

Check that node1 has no pre-existing peers

```
c1-cli listpeers
```

Connect to node2

```
c1-cli connect <node2_id> localhost 9732
```

Send funds to each node

```
bitcoin-cli --rpcpassword=password --rpcuser=lnd --regtest sendtoaddress <node1_receive_addr> 100
bitcoin-cli --rpcpassword=password --rpcuser=lnd --regtest sendtoaddress <node2_receive_addr> 100
```

Set up a channel with 500,000 sats

```
c1-cli fundchannel <node2_id> 500000
```

Confirm funding transaction by repeating:

```
bitcoin-cli --rpcpassword=password --rpcuser=lnd --regtest generatetoaddress 20 <node2_receive_addr
```

Check for channel between c1 and c2:

```
c1-cli listchannels
```
