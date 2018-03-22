# Automated Tests

Tests using Truffle automated testing framework for crowdfunding, lending and Token P rewards token mining.

Contract files will be included later so that you can run all the tests on your own. Contract files are proprietary at the time of this writing (14 Feb 2018).

### Getting Started

Currently tests will not run without contract files, but once the contracts are publicy released you will be able to run these tests locally with the following steps:


Install testrpc, truffle, and bignumber:

```
npm install -g ethereumjs-testrpc
```

```
npm install -g truffle
```

```
npm install bignumber.js
```


Run testrpc in background:

```
testrpc
```

Compile and Migrate contracts:

```
truffle compile
```

```
truffle migrate
```

Run tests:

```
truffle test
```



### Use Cases

Some tested use cases include iterations of the following:

* Creating crowdfunding proposals and having them approved
* Pledging tokens for crowdfunding proposals
* Proposals maximum reached, meeting their minimum goal, or failing to meet their goal in their defined timeframe
* Funds being correctly distributed after proposals are successful or fail





