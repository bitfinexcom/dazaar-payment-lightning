# dazaar-lightning
lightning payment api for dazaar stream services

## Install LND

Install LND from source using the following instructions for MacOS taken from the LND [INSTALL.md] (https://github.com/lightningnetwork/lnd/blob/master/docs/INSTALL.md):

Install dependencies:

​ Go:

```
brew install go@1.13
```

At this point, you should set your `$GOPATH` environment variable, which represents the path to your workspace. By default, `$GOPATH` is set to `~/go`. You will also need to add `$GOPATH/bin` to your `PATH`. This ensures that your shell will be able to detect the binaries you install.

```
export GOPATH=~/gocode
export PATH=$PATH:$GOPATH/bin
```

- We recommend placing the above in your .bashrc or in a setup script so that you can avoid typing this every time you open a new terminal window.

With the preliminary steps completed, to install `lnd`, `lncli`, and all related dependencies run the following commands:

```
go get -d github.com/lightningnetwork/lnd
cd $GOPATH/src/github.com/lightningnetwork/lnd
make && make install
```

To check that `lnd` was installed properly run the following command:

```
make check
```

## Install c-lightning

 Install c-lightning from source using the following instructions for MacOS taken from the c-lightning [INTALL.md] (https://github.com/ElementsProject/lightning/blob/master/doc/INSTALL.md):

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

Make sure bitcoind is running using `bitcoin.conf` given in `.regtest` repository

### c-lightning

Start c-lightning daemon:

```
$ ./lightning/lightningd/lightningd --lightning-dir=<dazaar-dir>/.c2 --bitcoin-rpcuser=lnd --bitcoin-rpcpassword=password --network=regtest --log-level=debug --daemon --addr=localhost:9732
```

Set alias for c-lightning cli:

```
$ alias c1-cli="<c-lightning-dir>/lightning/cli/lightning-cli --lightning-dir=<dazaar-dir>/.c1 --network=regtest"
```

Check that node1 has no pre-existing peers

```
$ c1-cli listpeers
```

Create a receiveing address for each node:

```
$ c1-cli newaddr
$ c2-cli newaddr
```

Connect to node2

```
$ c1-cli connect <node2_id> localhost 9732
```

Send funds to each node

```
$ bitcoin-cli --rpcpassword=password --rpcuser=lnd --regtest sendtoaddress <node1_receive_addr> 100
$ bitcoin-cli --rpcpassword=password --rpcuser=lnd --regtest sendtoaddress <node2_receive_addr> 100
```

Set up a channel with 500,000 sats

```
$ c1-cli fundchannel <node2_id> 500000
```

Confirm funding transaction by repeating:

```
$ bitcoin-cli --rpcpassword=password --rpcuser=lnd --regtest generatetoaddress 20 <node2_receive_addr
```

Check for that both nodes see the channel:

```
$ c1-cli listchannels
$ c2-cli listchannels
```

### LND

In new terrminal windows, start the LND daemons:

```
$ lnd --lnddir=.lnd1
$ lnd --lnddir=.lnd2
```

Optional - Set alias for lncli command:

```
$ echo 'alias lncli1="lncli --lnddir=.lnd1 --network=regtest --rpcserver=localhost:12009"' >> .bash_profile
$ echo 'alias lncli2="lncli --lnddir=.lnd2 --network=regtest --rpcserver=localhost:13009"' >> .bash_profile
```

Create/unlock wallets:

```
$ lncli1 create
$ lncli2 create
```

Check that node1 has no pre-existing peers

```
$ lncli1 listpeers
```

 - If they do, run `lncli1 listchannels`
 - The nodes may already have a prexisting channel in which case skip the following steps

Create a receiveing address for each node:

```
$ lncli1 newaddr
$ lncli2 newaddr
```

Send funds to each node

```
$ bitcoin-cli --rpcpassword=password --rpcuser=lnd --regtest sendtoaddress <node1_receive_addr> 100
$ bitcoin-cli --rpcpassword=password --rpcuser=lnd --regtest sendtoaddress <node2_receive_addr> 100
```

Set up a channel with 500,000 sats

```
$ lncli1 openchannel <node2_id> 500000
```

Confirm funding transaction by repeating:

```
$ bitcoin-cli --rpcpassword=password --rpcuser=lnd --regtest generatetoaddress 20 <node2_receive_addr
```

Check that both nodes see the channel:

```
$ lncli1 listchannels
$ lncli2 listchannels
```

### 
