var Crowdfund = artifacts.require('Crowdfund');
var Elixir = artifacts.require('Elixir');
var BigNumber = require('bignumber.js');
BigNumber.config({ROUNDING_MODE: BigNumber.ROUND_FLOOR});
let currEthPrice = 845;
let gasPriceGwei = 20;
contract('Crowdfund', function(accounts) {
let crowdfundInstance;
let token
let minGoal = 1
let maxGoal = 1000
let title = "Test Project"
let description = "this is a project with goals"
let hostCut = 1000000000
let duration = 100
let host = accounts[1]
let user1 = accounts[0]
let user2 = accounts[2]
let user3 = accounts[3]
let user4 = accounts[4]
let user5 = accounts[5]
let user6 = accounts[6]
let user7 = accounts[7]
let precision = 100000000000000000000
let tokenAddress
let cappedGoalAmt = 100000000000000000000000000000;
let statusKey = {PROPOSED_STATUS: 1, UNDERWAY_STATUS: 2, SUFFICIENT_STATUS: 3, FAILED_STATUS: 4, REQUEST_CANCELED_BY_CREATOR: 5, REQUEST_REJECTED_BY_HOST: 6, DISTRIBUTED_STATUS: 7}
let proposalArgKey = {title: 0, description: 1, minGoal: 2, maxGoal: 3, hostCut: 4, duration: 5, startTime: 6, status: 7, amountRaisedSoFar: 8, host: 9, tokenAddress: 10, creator: 11}
// pass an array of user objects with address and balance and retreive current token balances
function getUserBalances(users){
return Promise.all(users.map( function (userObj){
let user = userObj.user;
return token.balanceOf(user)
}))
}
// take the output of getUserBalances and update the user object array with current balances
function updateUserBalances(users, data, check){
for( let i = 0; i < data.length; i++ ){
if( typeof check !== 'undefined'){
check(users[i].balance, data[i].toNumber())
}
users[i].balance = data[i].toNumber()
}
}
// distribute tokens to users
function distributeTokens(users, importAmt){
return Promise.all(users.map(function (userObj){
let user = userObj.user;
return token.importBalance(importAmt, {from: user}).then( function (data){
return token.balanceOf(user)
})
}))
}
// users approve a certain transfer amt for the contract
function approveContract(crowdfundInstance, users, amt){
return Promise.all(users.map( function (userObj){
let user = userObj.user
return token.approve(crowdfundInstance.address, amt, {from: user})
}))
}
function fillRandomArray( desiredLength, min, max ){
let randomArray = [];
for( let i = 0; i < desiredLength; i++ ){
randomArray.push( Math.floor(Math.random()*max) + min );
}
return randomArray
}
function createAndAcceptProposal(creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress){
let proposalIndex = 0;
let startBlock = 0;
return crowdfundInstance.makeProposal(title, description, minGoal, maxGoal, hostCut, duration, host, tokenAddress, {from: creator}).then(function(ret) {
assert.isOk(ret);
proposalIndex = ret.logs[0].args.index.toNumber();
return crowdfundInstance.acceptProposal(proposalIndex, {from: host});
}).then(function (ret){
startBlock = ret.receipt.blockNumber;
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['UNDERWAY_STATUS']);
return Promise.resolve({proposalIndex: proposalIndex, startBlock: startBlock});
} )
}
function createAcceptAndUsersPledgeForProposal(amtRaised, participatingUsersBal, hostAndCreator, importAmt, userPledgeAmt, userApproveAmt, creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress){
let startBlock = 0;
return distributeTokens(participatingUsersBal, importAmt).then( function (data){
// check that users have at least distributed balance
function check(originalUserBalance, currentUserBalance){
assert.isAtLeast(currentUserBalance, importAmt);
}
updateUserBalances(participatingUsersBal, data, check)
return getUserBalances(hostAndCreator);
}).then( function( data ) {
// check host and creator balances
updateUserBalances(hostAndCreator, data);
return createAndAcceptProposal(creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress);
}).then( function (proposalProperties){
proposalIndex = proposalProperties.proposalIndex;
startBlock = proposalProperties.startBlock;
return approveContract(crowdfundInstance, participatingUsersBal, userApproveAmt);
}).then( function (approvals){
approvals.forEach(function (ret){
})
// users pledge tokens
return Promise.all(participatingUsersBal.map( function (userObj){
let user = userObj.user
amtRaised += userPledgeAmt;
return crowdfundInstance.pledgeTokens(userPledgeAmt, proposalIndex, {from: user})
}))
}).then( function (pledges){
pledges.forEach(function (ret){
})
return getUserBalances(participatingUsersBal)
}).then( function (data){
// make sure users amt is decreased by pledge amount
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance - userPledgeAmt, currentUserBalance );
}
updateUserBalances(participatingUsersBal, data, check);
return Promise.resolve({proposalIndex: proposalIndex, amtRaised: amtRaised, startBlock: startBlock})
})
}
function awaitBlock(startBlock, duration, proposalIndex, actionForProposal, failCheck, successCheck){
let currentBlock;
function getUntil(){
return actionForProposal(proposalIndex).then( function(result){
currentBlock = result.receipt.blockNumber
if(currentBlock <= startBlock + duration){
return crowdfundInstance.ideas.call(proposalIndex).then( function (proposalState){
failCheck(proposalState);
return getUntil()
})
}
else{
return crowdfundInstance.ideas.call(proposalIndex).then( function (proposalState){
successCheck(proposalState);
})
}
})
}
return getUntil();
}
before( function (){
return Elixir.deployed().then( function (instance){
token = instance
tokenAddress = instance.address
return Crowdfund.deployed()
}).then(function(instance){
crowdfundInstance = instance
})
})
it("should allow edge max and min goals", function() {
let proposalIndex = 0
let maxGoal = cappedGoalAmt;
return crowdfundInstance.makeProposal(title, description, minGoal, maxGoal, hostCut, duration, host, tokenAddress).then(function(ret) {
proposalIndex = ret.logs[0].args.index.toNumber();
assert.typeOf(ret, 'object');
assert.isOk(ret);
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
assert.equal(proposalState[ proposalArgKey['maxGoal'] ].toNumber(), maxGoal, 'max goal should be set correctly');
assert.equal(proposalState[ proposalArgKey['minGoal'] ].toNumber(), minGoal, 'min goal should be set');
})
});
it("should allow long description and title", function() {
let proposalIndex = 0
let maxGoal = cappedGoalAmt;
let title = "Test ProjectTest ProjectTest ProjectTest ProjectTest ProjectTest ProjectTest ProjectTest ProjectTest ProjectTest Project";
let description = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Praesent lobortis nec ipsum nec lacinia. Ut posuere urna libero, scelerisque facilisis augue sodales ac. Suspendisse aliquet id ipsum ut tempus. Suspendisse potenti. Proin suscipit purus diam, sed tempor dui dapibus nec. Nulla ac ex est. Aenean imperdiet ornare feugiat. Aenean blandit nisi odio, non pellentesque risus hendrerit vel. Pellentesque pellentesque eros sit amet nulla lobortis viverra. Praesent hendrerit leo lorem, vel commodo tortor placerat ac. Vivamus at tellus ac turpis venenatis maximus vitae sed orci. Pellentesque et elit malesuada ex imperdiet faucibus vel non sem. Mauris auctor massa sed odio scelerisque, eu tincidunt tortor posuere. In posuere sapien ipsum, non semper lacus efficitur eget. Proin a ante volutpat, ultricies nibh nec, facilisis sem. Morbi non nisi in nibh facilisis varius sit amet vel nulla. Nam ac nisl sit amet risus laoreet accumsan. Morbi a faucibus dui. Integer eu accumsan quam, sit amet ultricies neque. Praesent in ipsum suscipit, finibus mauris nec, dignissim enim. Sed ut nunc molestie, viverra nunc ac, consectetur nibh. Curabitur purus ligula, ultrices ac mattis et, venenatis eu augue. Etiam cursus pellentesque nisi, sit amet lobortis urna. Suspendisse potenti. Phasellus enim sapien, sodales sed fringilla eget, gravida non."
return crowdfundInstance.makeProposal(title, description, minGoal, maxGoal, hostCut, duration, host, tokenAddress).then(function(ret) {
proposalIndex = ret.logs[0].args.index.toNumber();
assert.typeOf(ret, 'object');
assert.isOk(ret);
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
assert.equal(proposalState[ proposalArgKey['maxGoal'] ].toNumber(), maxGoal, 'max goal should be set correctly');
assert.equal(proposalState[ proposalArgKey['minGoal'] ].toNumber(), minGoal, 'min goal should be set');
})
});
it("should allow normal length description and title", function() {
let proposalIndex = 0
let maxGoal = cappedGoalAmt;
let title = "THIS IS A NORMAL LENGTH TITLE";
let description = 'The standard chunk of Lorem Ipsum used since the 1500s is reproduced below for those interested. Sections 1.10.32 and 1.10.33 from "de Finibus Bonorum et Malorum" by Cicero are also reproduced in their exact original form, accompanied by English versions from the 1914 translation by H. Rackham.'
return crowdfundInstance.makeProposal(title, description, minGoal, maxGoal, hostCut, duration, host, tokenAddress).then(function(ret) {
proposalIndex = ret.logs[0].args.index.toNumber();
assert.typeOf(ret, 'object');
assert.isOk(ret);
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
assert.equal(proposalState[ proposalArgKey['maxGoal'] ].toNumber(), maxGoal, 'max goal should be set correctly');
assert.equal(proposalState[ proposalArgKey['minGoal'] ].toNumber(), minGoal, 'min goal should be set');
})
});
it("should allow edge goal close to max requiring bignumber", function() {
let proposalIndex = 0
// user input precision to 4 decimals
let maxGoal = BigNumber(cappedGoalAmt).minus(100000000000000);
return crowdfundInstance.makeProposal(title, description, minGoal, maxGoal.toNumber(), hostCut, duration, host, tokenAddress).then(function(ret) {
proposalIndex = ret.logs[0].args.index.toNumber();
assert.typeOf(ret, 'object');
assert.isOk(ret);
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
assert.isTrue(maxGoal.isEqualTo( proposalState[ proposalArgKey['maxGoal'] ]) , 'max goal should be set');
assert.equal(proposalState[ proposalArgKey['minGoal'] ].toNumber(), minGoal, 'min goal should be set');
})
});
it("should allow reasonable max goals", function() {
let randomMaxGoals = fillRandomArray(5, 1, cappedGoalAmt)
let minGoal = 1;
return Promise.all( randomMaxGoals.map( function (randMaxGoal){
return crowdfundInstance.makeProposal(title, description, minGoal, randMaxGoal, hostCut, duration, host, tokenAddress);
})).then(function(ret) {
assert.typeOf(ret, 'array');
assert.equal(ret.length, randomMaxGoals.length);
assert.isOk(ret[0]);
assert.typeOf(ret[0], 'object')
})
})
it("should allow reasonable min goals", function() {
let randomMinGoals = fillRandomArray(5, 1, cappedGoalAmt-2)
return Promise.all( randomMinGoals.map( function (randMinGoal){
let randMaxGoal = randMinGoal+=1;
return crowdfundInstance.makeProposal(title, description, randMinGoal, randMaxGoal, hostCut, duration, host, tokenAddress);
})).then(function(ret) {
assert.typeOf(ret, 'array');
assert.equal(ret.length, randomMinGoals.length);
assert.isOk(ret[0]);
assert.typeOf(ret[0], 'object')
})
})
it("should not allow 0 min goal", function() {
let zeroMinGoal = 0;
return crowdfundInstance.makeProposal(title, description, zeroMinGoal, maxGoal, hostCut, duration, host, tokenAddress).then(function (ret){
assert.fail(ret)
}).catch( function(err){
assert.typeOf(err, 'error');
})
});
it("should not allow less than one fractional min balance", function() {
let fracMinGoal = 0.01;
return crowdfundInstance.makeProposal(title, description, fracMinGoal, maxGoal, hostCut, duration, host, tokenAddress).then(function (ret){
assert.fail(ret)
}).catch( function(err){
assert.typeOf(err, 'error');
})
});
it("should not allow min goal greater than max goal", function() {
let minGoal = 10000;
let maxGoal = 9000;
return crowdfundInstance.makeProposal(title, description, minGoal, maxGoal, hostCut, duration, host, tokenAddress).then(function (ret){
assert.fail(ret)
}).catch( function(err){
assert.typeOf(err, 'error');
})
});
it("should round down fractional min balance", function() {
let zeroMinGoal = 17.019873978468076476688;
return crowdfundInstance.makeProposal(title, description, zeroMinGoal, maxGoal, hostCut, duration, host, tokenAddress).then(function (ret){
proposalIndex = ret.logs[0].args.index.toNumber();
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
assert.equal(proposalState[ proposalArgKey['maxGoal'] ].toNumber(), Math.floor(maxGoal));
assert.equal(proposalState[ proposalArgKey['minGoal'] ].toNumber(), Math.floor(zeroMinGoal));
}).catch( function(err){
console.log('err', err);
assert.typeOf(err, 'error');
})
});
it("should not allow max goal to exceed max goal limit", function() {
let highMaxGoal = Math.pow(10, 30) * 100000000000;
return crowdfundInstance.makeProposal(title, description, minGoal, highMaxGoal, hostCut, duration, host, tokenAddress).then(function (ret){
assert.fail(ret)
}).catch( function(err){
assert.typeOf(err, 'error');
})
});
it("should be okay with empty title", function() {
let blankTitle = "";
return crowdfundInstance.makeProposal(blankTitle, description, minGoal, maxGoal, hostCut, duration, host, tokenAddress).then(function(ret) {
assert.isOk(ret);
})
});
it("should be okay with random character title", function() {
let randomCharTitle = "(SANX&*@S(^@"
return crowdfundInstance.makeProposal(randomCharTitle, description, minGoal, maxGoal, hostCut, duration, host, tokenAddress).then(function(ret) {
assert.isOk(ret);
})
});
it("host can accept proposal", function() {
let creator = user1;
return createAndAcceptProposal(creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress);
})
it("non-host can't accept proposal", function() {
let proposalIndex = 0;
return crowdfundInstance.makeProposal(title, description, minGoal, maxGoal, hostCut, duration, host, tokenAddress).then(function(ret) {
assert.isOk(ret);
proposalIndex = ret.logs[0].args.index.toNumber();
return crowdfundInstance.acceptProposal(proposalIndex, {from: user1});
}).then(function (ret){
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['PROPOSED_STATUS']);
} )
})
it("host can't accept already accepted proposal", function() {
let proposalIndex = 0;
let creator = user1;
return createAndAcceptProposal(creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress).then( function (proposalProperties){
proposalIndex = proposalProperties.proposalIndex;
}).then( function (){
return crowdfundInstance.acceptProposal.call(proposalIndex, {from: host});
}).then( function (ret){
assert.equal(ret, false);
})
})
it("should not allow string for goal", function() {
let stringMinGoal = "stringgoal"
return crowdfundInstance.makeProposal(title, description, stringMinGoal, maxGoal, hostCut, duration, host, tokenAddress).then(function(ret) {
assert.fail(ret);
}).catch( function (err){
assert.typeOf(err, 'error')
})
});
it("does not allow user to pledge without sufficient approved funds", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: 0}, {user: user2, balance: 0}, {user: user3, balance: 0}];
let creator = user4;
let importAmt = 1000;
let approvalAmt = 500;
let pledgeAmt = 750;
let proposalIndex = 0;
return distributeTokens(participatingUsersBal, importAmt).then( function (data){
updateUserBalances(participatingUsersBal, data);
return createAndAcceptProposal(creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress);
}).then(function(proposalProperties) {
proposalIndex = proposalProperties.proposalIndex;
return token.approve(crowdfundInstance, approvalAmt, {from: user1})
}).then( function (){
return crowdfundInstance.pledgeTokens(pledgeAmt, proposalIndex, {from: user1})
}).then( function (ret){
assert.fail(ret)
}).catch( function(err){
assert.typeOf(err, 'error')
})
})
it("proposal sells out and is distributed correctly", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: 0}, {user: user2, balance: 0}];
let creator = user3;
let maxGoal = 1000000;
let userPledgeAmt = maxGoal/participatingUsersBal.length;
let userApproveAmt = userPledgeAmt;
let importAmt = userPledgeAmt ;
let amtRaised = 0;
let hostAndCreator = [{user: host, balance: 0}, {user: creator, balance: 0}]
let proposalIndex = 0;
return createAcceptAndUsersPledgeForProposal(amtRaised, participatingUsersBal, hostAndCreator, importAmt, userPledgeAmt, userApproveAmt, creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress).then( function(proposalProperties){
proposalIndex = proposalProperties.proposalIndex;
amtRaised = proposalProperties.amtRaised;
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// check that proposal changed to distributed since amount raised meets goal
assert.equal(proposalState[ proposalArgKey['amountRaisedSoFar'] ].toNumber(), userPledgeAmt*participatingUsersBal.length);
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['DISTRIBUTED_STATUS']);
return getUserBalances(participatingUsersBal);
}).then( function (data){
// make sure user balances didnt change
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance, currentUserBalance);
}
updateUserBalances(participatingUsersBal, data, check)
return getUserBalances(hostAndCreator);
}).then( function (data){
// make sure host and creator receive correct amount
let hostAmt = Math.floor(amtRaised * (hostCut/precision));
let creatorAmt = amtRaised - hostAmt;
assert.equal(data[0].toNumber(), hostAmt + hostAndCreator[0].balance);
assert.equal(data[1].toNumber(), creatorAmt + hostAndCreator[1].balance)
})
})
it("proposal sells out and is distributed correctly with many users pledging", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: 0}, {user: user2, balance: 0}, {user: user4, balance: 0}, {user: user5, balance: 0}, {user: user6, balance: 0}, {user: user7, balance: 0}];
let creator = user3;
let maxGoal = 6000000;
let userPledgeAmt = maxGoal/participatingUsersBal.length;
let userApproveAmt = userPledgeAmt;
let importAmt = userPledgeAmt ;
let amtRaised = 0;
let hostAndCreator = [{user: host, balance: 0}, {user: creator, balance: 0}]
let proposalIndex = 0;
return createAcceptAndUsersPledgeForProposal(amtRaised, participatingUsersBal, hostAndCreator, importAmt, userPledgeAmt, userApproveAmt, creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress).then( function(proposalProperties){
proposalIndex = proposalProperties.proposalIndex;
amtRaised = proposalProperties.amtRaised;
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// check that proposal changed to distributed since amount raised meets goal
assert.equal(proposalState[ proposalArgKey['amountRaisedSoFar'] ].toNumber(), userPledgeAmt*participatingUsersBal.length);
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['DISTRIBUTED_STATUS']);
return getUserBalances(participatingUsersBal);
}).then( function (data){
// make sure user balances didnt change
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance, currentUserBalance);
}
updateUserBalances(participatingUsersBal, data, check)
return getUserBalances(hostAndCreator);
}).then( function (data){
// make sure host and creator receive correct amount
let hostAmt = Math.floor(amtRaised * (hostCut/precision));
let creatorAmt = amtRaised - hostAmt;
assert.equal(data[0].toNumber(), hostAmt + hostAndCreator[0].balance);
assert.equal(data[1].toNumber(), creatorAmt + hostAndCreator[1].balance)
})
})
it("proposal sells out and is distributed correctly with edge max goal (using bignumber)", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: BigNumber(0)}, {user: user2, balance: BigNumber(0)}];
let creator = user3;
let maxGoal = BigNumber(cappedGoalAmt);
let userPledgeAmt = maxGoal.dividedBy(participatingUsersBal.length);
let userApproveAmt = userPledgeAmt;
let importAmt = userPledgeAmt;
let amtRaised = BigNumber(0);
let hostAndCreator = [{user: host, balance: BigNumber(0)}, {user: creator, balance: BigNumber(0)}]
let proposalIndex = 0;
let startBlock = 0;
return Promise.all(participatingUsersBal.map(function (userObj){
let user = userObj.user;
return token.importBalance(importAmt.toNumber(), {from: user}).then( function (data){
return token.balanceOf(user)
})
})).then( function (data){
// check that users have at least distributed balance
function check(originalUserBalance, currentUserBalance){
assert.isAtLeast(currentUserBalance.toNumber(), importAmt);
}
for( let i = 0; i < data.length; i++ ){
if( typeof check !== 'undefined'){
check(participatingUsersBal[i].balance, data[i])
}
participatingUsersBal[i].balance = BigNumber(data[i])
}
return getUserBalances(hostAndCreator);
}).then( function( data ) {
// check host and creator balances
for( let i = 0; i < data.length; i++ ){
hostAndCreator[i].balance = BigNumber(data[i])
}
return crowdfundInstance.makeProposal(title, description, minGoal, maxGoal.toNumber(), hostCut, duration, host, tokenAddress, {from: creator}) 
}).then(function(ret) {
assert.isOk(ret);
proposalIndex = ret.logs[0].args.index.toNumber();
return crowdfundInstance.acceptProposal(proposalIndex, {from: host});
}).then(function (ret){
startBlock = ret.receipt.blockNumber;
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['UNDERWAY_STATUS']);
return Promise.all(participatingUsersBal.map( function (userObj){
let user = userObj.user
return token.approve(crowdfundInstance.address, userApproveAmt.toNumber(), {from: user})
}))
}).then( function (){
// users pledge tokens
return Promise.all(participatingUsersBal.map( function (userObj){
let user = userObj.user
amtRaised = amtRaised.plus(userPledgeAmt);
return crowdfundInstance.pledgeTokens(userPledgeAmt.toNumber(), proposalIndex, {from: user})
}))
}).then( function (){
return getUserBalances(participatingUsersBal)
}).then( function (data){
// make sure users amt is decreased by pledge amount
function check(originalUserBalance, currentUserBalance){
assert.isTrue((originalUserBalance.minus(userPledgeAmt)).isEqualTo(currentUserBalance))
}
for( let i = 0; i < data.length; i++ ){
if( typeof check !== 'undefined'){
check(participatingUsersBal[i].balance, data[i])
}
participatingUsersBal[i].balance = data[i]
}
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// check that proposal changed to distributed since amount raised meets goal
assert.isTrue((userPledgeAmt.times(participatingUsersBal.length)).isEqualTo(proposalState[ proposalArgKey['amountRaisedSoFar'] ]));
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['DISTRIBUTED_STATUS']);
return getUserBalances(participatingUsersBal);
}).then( function (data){
// make sure user balances didnt change
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance, currentUserBalance);
}
updateUserBalances(participatingUsersBal, data, check)
return getUserBalances(hostAndCreator);
}).then( function (data){
// make sure host and creator receive correct amount
let hostAmt = amtRaised.times(hostCut/precision);
let creatorAmt = amtRaised.minus(hostAmt);
assert.isTrue(BigNumber(data[0]).isEqualTo(hostAmt.plus(hostAndCreator[0].balance)));
assert.isTrue(BigNumber(data[1]).isEqualTo(creatorAmt.plus(hostAndCreator[1].balance)));
})
})
it("does not allow distribute to be called on already sold out campaign", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: 0}, {user: user2, balance: 0}];
let creator = user3;
let userPledgeAmt = 500;
let userApproveAmt = userPledgeAmt;
let importAmt = 1000;
let amtRaised = 0;
let hostAndCreator = [{user: host, balance: 0}, {user: creator, balance: 0}]
let proposalIndex = 0;
return createAcceptAndUsersPledgeForProposal(amtRaised, participatingUsersBal, hostAndCreator, importAmt, userPledgeAmt, userApproveAmt, creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress).then( function (proposalProperties){
proposalIndex = proposalProperties.proposalIndex;
amtRaised = proposalProperties.amtRaised;
}).then( function (){
return crowdfundInstance.distributeSuccessfulCampaignFunds.call(proposalIndex)
}).then( function (data){
// should not allow distribute call on sold out campaign
assert.equal(data, false);
return crowdfundInstance.distributeSuccessfulCampaignFunds(proposalIndex);
}).then(function (ret){
// calling distribute should not affect rest of control flow
return getUserBalances(participatingUsersBal);
}).then( function (data){
return crowdfundInstance.ideas.call(proposalIndex);
}).then( function (proposalState){
// check that proposal changed to distributed since amount raised meets goal
assert.equal(proposalState[ proposalArgKey['amountRaisedSoFar'] ].toNumber(), userPledgeAmt*participatingUsersBal.length);
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['DISTRIBUTED_STATUS']);
return getUserBalances(participatingUsersBal);
}).then( function (data){
// make sure user balances didnt change
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance, currentUserBalance);
}
updateUserBalances(participatingUsersBal, data, check);
return getUserBalances(hostAndCreator);
}).then( function (data){
// make sure host and creator receive correct amount
let hostAmt = Math.floor(amtRaised * (hostCut/precision));
let creatorAmt = amtRaised - hostAmt;
assert.equal(data[0].toNumber(), hostAmt + hostAndCreator[0].balance);
assert.equal(data[1].toNumber(), creatorAmt + hostAndCreator[1].balance)
})
})
it("does not allow users to pledge 0", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: 0}, {user: user2, balance: 0}];
let creator = user3;
let userApproveAmt = 100;
let userPledgeAmt = 0;
let importAmt = 1000;
let amtRaised = 0;
let hostAndCreator = [{user: host, balance: 0}, {user: creator, balance: 0}]
let proposalIndex = 0;
return distributeTokens(participatingUsersBal, importAmt).then( function (data){
// check that users have at least distributed balance
function check(originalUserBalance, currentUserBalance){
assert.isAtLeast(currentUserBalance, importAmt);
}
updateUserBalances(participatingUsersBal, data, check)
return getUserBalances(hostAndCreator);
}).then( function( data ) {
// check host and creator balances
updateUserBalances(hostAndCreator, data);
return createAndAcceptProposal(creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress);
}).then( function (proposalProperties){
proposalIndex = proposalProperties.proposalIndex;
return approveContract(crowdfundInstance, participatingUsersBal, userApproveAmt)
}).then( function (){
// users pledge tokens
return Promise.all(participatingUsersBal.map( function (userObj){
let user = userObj.user
amtRaised += userPledgeAmt;
return crowdfundInstance.pledgeTokens(userPledgeAmt, proposalIndex, {from: user})
}))
}).then( function (data){
assert.fail(data);
}).catch( function (err){
assert.typeOf(err, 'error');
})
})
it("does not allow pledges in proposal that hit max goal", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: 0}, {user: user2, balance: 0}];
let creator = user3;
let lateParticipants = [{user:user4, balance: 0}];
let userPledgeAmt = 500;
let userApproveAmt = userPledgeAmt;
let importAmt = 1000;
let amtRaised = 0;
let hostAndCreator = [{user: host, balance: 0}, {user: creator, balance: 0}]
let proposalIndex = 0;
return createAcceptAndUsersPledgeForProposal(amtRaised, participatingUsersBal, hostAndCreator, importAmt, userPledgeAmt, userApproveAmt, creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress).then( function (proposalProperties){
proposalIndex = proposalProperties.proposalIndex;
amtRaised = proposalProperties.amtRaised;
}).then( function (){
return distributeTokens(lateParticipants, importAmt)
}).then( function (data){
updateUserBalances(lateParticipants, data);
// late participant approves
return approveContract(crowdfundInstance, lateParticipants, userPledgeAmt);
}).then( function (){
// late participant unable to pledge
return crowdfundInstance.pledgeTokens.call(userPledgeAmt, proposalIndex, {from: lateParticipants[0].user})
}).then( function (ret){
assert.equal(ret, false);
// does not interfere with subsequent events even if many late tokens were pledged
for( let i = 0; i < 10; i++){
crowdfundInstance.pledgeTokens(userPledgeAmt, proposalIndex, {from: lateParticipants[0].user});
}
return Promise.resolve();
}).then( function (){
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function(proposalState){
assert.equal(proposalState[ proposalArgKey['amountRaisedSoFar'] ].toNumber(), userPledgeAmt*participatingUsersBal.length);
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['DISTRIBUTED_STATUS']);
return getUserBalances(lateParticipants)
}).then( function(data){
// make sure that participants unable to pledge didnt have a balance reduction
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance, currentUserBalance)
}
updateUserBalances(lateParticipants, data, check);
return getUserBalances(participatingUsersBal);
}).then( function (data){
// make sure user balances didnt change
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance, currentUserBalance);
}
updateUserBalances(participatingUsersBal, data, check)
return getUserBalances(hostAndCreator);
}).then( function (data){
// make sure host and creator receive correct amount
let hostAmt = Math.floor(amtRaised * (hostCut/precision));
let creatorAmt = amtRaised - hostAmt;
assert.equal(data[0].toNumber(), hostAmt + hostAndCreator[0].balance);
assert.equal(data[1].toNumber(), creatorAmt + hostAndCreator[1].balance)
})
})
it("allows user to make multiple pledges to same proposal", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: 0}, {user: user2, balance: 0}];
let creator = user3;
let userPledgeAmt = 200;
let userApproveAmt = 1000;
let userSecondPledgeAmt = maxGoal - userPledgeAmt*participatingUsersBal.length
let importAmt = 1000;
let amtRaised = 0;
let hostAndCreator = [{user: host, balance: 0}, {user: creator, balance: 0}]
let proposalIndex = 0;
return createAcceptAndUsersPledgeForProposal(amtRaised, participatingUsersBal, hostAndCreator, importAmt, userPledgeAmt, userApproveAmt, creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress).then( function (proposalProperties){
proposalIndex = proposalProperties.proposalIndex;
amtRaised = proposalProperties.amtRaised;
}).then( function (){
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// proposal should be sufficient status and then user should be able to pledge again
assert.equal(proposalState[proposalArgKey['status'] ].toNumber(), statusKey['SUFFICIENT_STATUS']);
amtRaised+=userSecondPledgeAmt
return crowdfundInstance.pledgeTokens(userSecondPledgeAmt, proposalIndex, {from: participatingUsersBal[0].user})
}).then( function (ret){
return getUserBalances(participatingUsersBal)
}).then( function(data){
assert.equal(participatingUsersBal[0].balance - userSecondPledgeAmt, data[0])
participatingUsersBal[0].balance = data[0]
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// check that proposal changed to distributed since amount raised meets goal
assert.equal(proposalState[ proposalArgKey['amountRaisedSoFar'] ].toNumber(), userPledgeAmt*participatingUsersBal.length + userSecondPledgeAmt);
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['DISTRIBUTED_STATUS']);
return getUserBalances(participatingUsersBal);
}).then( function (data){
// make sure user balances didnt change
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance, currentUserBalance);
}
updateUserBalances(participatingUsersBal, data, check)
return getUserBalances(hostAndCreator);
}).then( function (data){
// make sure host and creator receive correct amount
let hostAmt = Math.floor(amtRaised * (hostCut/precision));
let creatorAmt = amtRaised - hostAmt;
assert.equal(data[0].toNumber(), hostAmt + hostAndCreator[0].balance);
assert.equal(data[1].toNumber(), creatorAmt + hostAndCreator[1].balance)
})
})
it("proposal sufficient when meet minimum goal but not maximum", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: 0}, {user: user2, balance: 0}];
let creator = user3;
let importAmt = 1000;
let amtRaised = 0;
let minGoal = 500;
let maxGoal = 100000;
let userPledgeAmt = minGoal/participatingUsersBal.length;
let userApproveAmt = userPledgeAmt;
let hostAndCreator = [{user: host, balance: 0}, {user: creator, balance: 0}]
let proposalIndex = 0;
return createAcceptAndUsersPledgeForProposal(amtRaised, participatingUsersBal, hostAndCreator, importAmt, userPledgeAmt, userApproveAmt, creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress).then( function (proposalProperties){
proposalIndex = proposalProperties.proposalIndex;
amtRaised = proposalProperties.amtRaised;
}).then( function (data){
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// check that proposal changed to sufficient status since amount raised meets minimum goal but not maximum
assert.equal(proposalState[ proposalArgKey['amountRaisedSoFar'] ].toNumber(), userPledgeAmt*participatingUsersBal.length);
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['SUFFICIENT_STATUS']);
return getUserBalances(hostAndCreator);
}).then( function (data){
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance, currentUserBalance)
}
// make sure host and creator have not received any balances yet
updateUserBalances(hostAndCreator, data, check)
})
})
it("cannot distribute successful campaign funds before duration", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: 0}, {user: user2, balance: 0}];
let creator = user3;
let importAmt = 1000;
let amtRaised = 0;
let minGoal = 500;
let maxGoal = 100000;
let userPledgeAmt = minGoal/participatingUsersBal.length;
let userApproveAmt = userPledgeAmt;
let hostAndCreator = [{user: host, balance: 0}, {user: creator, balance: 0}]
let proposalIndex = 0;
return createAcceptAndUsersPledgeForProposal(amtRaised, participatingUsersBal, hostAndCreator, importAmt, userPledgeAmt, userApproveAmt, creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress).then( function (proposalProperties){
proposalIndex = proposalProperties.proposalIndex;
amtRaised = proposalProperties.amtRaised;
}).then( function (data){
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// check that proposal changed to sufficient status since amount raised meets minimum goal but not maximum
assert.equal(proposalState[ proposalArgKey['amountRaisedSoFar'] ].toNumber(), userPledgeAmt*participatingUsersBal.length);
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['SUFFICIENT_STATUS']);
return crowdfundInstance.distributeSuccessfulCampaignFunds.call(proposalIndex)
}).then( function (ret){
assert.equal(ret, false);
})
})
it("can distribute successful campaign funds only after duration", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: 0}, {user: user2, balance: 0}];
let creator = user3;
let importAmt = 1000;
let amtRaised = 0;
let minGoal = 500;
let maxGoal = 100000;
let userPledgeAmt = minGoal/participatingUsersBal.length;
let userApproveAmt = userPledgeAmt;
let hostAndCreator = [{user: host, balance: 0}, {user: creator, balance: 0}]
let startBlock;
let currentBlock;
let duration = 20;
let proposalIndex = 0;
return createAcceptAndUsersPledgeForProposal(amtRaised, participatingUsersBal, hostAndCreator, importAmt, userPledgeAmt, userApproveAmt, creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress).then( function (proposalProperties){
proposalIndex = proposalProperties.proposalIndex;
amtRaised = proposalProperties.amtRaised;
startBlock = proposalProperties.startBlock;
}).then( function (ret){
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// check that proposal changed to sufficient status since amount raised meets minimum goal but not maximum
assert.equal(proposalState[ proposalArgKey['amountRaisedSoFar'] ].toNumber(), userPledgeAmt*participatingUsersBal.length);
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['SUFFICIENT_STATUS']);
return crowdfundInstance.distributeSuccessfulCampaignFunds(proposalIndex)
}).then( function (ret){
// should allow funds to be distributed only when block distributuration passed
function failCheck(proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['SUFFICIENT_STATUS']);
}
function successCheck(proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['DISTRIBUTED_STATUS']);
}
return awaitBlock(startBlock, duration, proposalIndex, crowdfundInstance.distributeSuccessfulCampaignFunds, failCheck, successCheck);
})
})
it("users can mark campaigns failed only after duration if insufficient funds", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: 0}, {user: user2, balance: 0}];
let creator = user3;
let importAmt = 1000;
let amtRaised = 0;
let minGoal = 500;
let maxGoal = 100000;
let userPledgeAmt = minGoal/(participatingUsersBal.length*2);
let userApproveAmt = userPledgeAmt;
let hostAndCreator = [{user: host, balance: 0}, {user: creator, balance: 0}]
let startBlock;
let currentBlock;
let duration = 20;
let proposalIndex = 0;
return createAcceptAndUsersPledgeForProposal(amtRaised, participatingUsersBal, hostAndCreator, importAmt, userPledgeAmt, userApproveAmt, creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress).then( function (proposalProperties){
proposalIndex = proposalProperties.proposalIndex;
amtRaised = proposalProperties.amtRaised;
startBlock = proposalProperties.startBlock;
}).then( function (){
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// check that proposal still underway status because min goal not reached
assert.equal(proposalState[ proposalArgKey['amountRaisedSoFar'] ].toNumber(), userPledgeAmt*participatingUsersBal.length);
function failCheck(proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['UNDERWAY_STATUS']);
}
function successCheck(proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['FAILED_STATUS']);
}
return awaitBlock(startBlock, duration, proposalIndex, crowdfundInstance.stateFail, failCheck, successCheck);
})
})
it("users can reclaim funds for failed campaigns", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: 0}, {user: user2, balance: 0}];
let creator = user3;
let importAmt = 1000;
let amtRaised = 0;
let minGoal = 500;
let maxGoal = 100000;
let userPledgeAmt = minGoal/(participatingUsersBal.length*2);
let userApproveAmt = userPledgeAmt;
let hostAndCreator = [{user: host, balance: 0}, {user: creator, balance: 0}]
let startBlock;
let currentBlock;
let duration = 20;
let proposalIndex = 0;
return createAcceptAndUsersPledgeForProposal(amtRaised, participatingUsersBal, hostAndCreator, importAmt, userPledgeAmt, userApproveAmt, creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress).then( function (proposalProperties){
proposalIndex = proposalProperties.proposalIndex;
amtRaised = proposalProperties.amtRaised;
startBlock = proposalProperties.startBlock;
}).then( function (ret){
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// check that proposal still underway status because min goal not reached
assert.equal(proposalState[ proposalArgKey['amountRaisedSoFar'] ].toNumber(), userPledgeAmt*participatingUsersBal.length);
function failCheck(proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['UNDERWAY_STATUS']);
}
function successCheck(proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['FAILED_STATUS']);
}
return awaitBlock(startBlock, duration, proposalIndex, crowdfundInstance.stateFail, failCheck, successCheck);
}).then( function (){
return crowdfundInstance.reclaimTokens(proposalIndex, {from: participatingUsersBal[0].user})
}).then( function (ret){
// user should have their token balances refunded
return getUserBalances(participatingUsersBal)
}).then( function(data){
assert.equal(participatingUsersBal[0].balance + userPledgeAmt, data[0].toNumber())
assert.equal(participatingUsersBal[1].balance, data[1].toNumber())
}).then( function (){
// the other user can reclaim their balance
return crowdfundInstance.reclaimTokens(proposalIndex, {from: participatingUsersBal[1].user})
}).then( function (ret){
// user should have their token balances refunded
return getUserBalances(participatingUsersBal)
}).then( function(data){
assert.equal(participatingUsersBal[0].balance + userPledgeAmt, data[0].toNumber())
assert.equal(participatingUsersBal[1].balance + userPledgeAmt, data[1].toNumber())
})
})
it("users cannot reclaim tokens multiple times", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: 0}, {user: user2, balance: 0}];
let creator = user3;
let importAmt = 1000;
let amtRaised = 0;
let minGoal = 500;
let maxGoal = 100000;
let userPledgeAmt = minGoal/(participatingUsersBal.length*2);
let userApproveAmt = userPledgeAmt;
let hostAndCreator = [{user: host, balance: 0}, {user: creator, balance: 0}]
let startBlock;
let currentBlock;
let duration = 20;
let proposalIndex = 0;
return createAcceptAndUsersPledgeForProposal(amtRaised, participatingUsersBal, hostAndCreator, importAmt, userPledgeAmt, userApproveAmt, creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress).then( function (proposalProperties){
proposalIndex = proposalProperties.proposalIndex;
amtRaised = proposalProperties.amtRaised;
startBlock = proposalProperties.startBlock;
}).then( function (ret){
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// check that proposal still underway status because min goal not reached
assert.equal(proposalState[ proposalArgKey['amountRaisedSoFar'] ].toNumber(), userPledgeAmt*participatingUsersBal.length);
function failCheck(proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['UNDERWAY_STATUS']);
}
function successCheck(proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['FAILED_STATUS']);
}
return awaitBlock(startBlock, duration, proposalIndex, crowdfundInstance.stateFail, failCheck, successCheck);
}).then( function (){
return crowdfundInstance.reclaimTokens(proposalIndex, {from: participatingUsersBal[0].user})
}).then( function (ret){
// user should have their token balances refunded
return getUserBalances(participatingUsersBal)
}).then( function(data){
assert.equal(participatingUsersBal[0].balance + userPledgeAmt, data[0].toNumber())
assert.equal(participatingUsersBal[1].balance, data[1].toNumber())
updateUserBalances(participatingUsersBal, data)
return crowdfundInstance.reclaimTokens(proposalIndex, {from: participatingUsersBal[0].user})
}).then( function (ret){
// user should have their token balances refunded
return getUserBalances(participatingUsersBal)
}).then( function(data){
function check( originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance, currentUserBalance)
}
updateUserBalances(participatingUsersBal, data, check)
})
})
it("users cannot reclaim tokens for proposals they havent pledged in", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: 0}, {user: user2, balance: 0}];
let nonParticipatingUsersBal = [{user: user4, balance: 0}, {user: user5, balance: 0}]
let creator = user3;
let importAmt = 1000;
let amtRaised = 0;
let minGoal = 500;
let maxGoal = 100000;
let userPledgeAmt = minGoal/(participatingUsersBal.length*2);
let userApproveAmt = userPledgeAmt;
let hostAndCreator = [{user: host, balance: 0}, {user: creator, balance: 0}]
let startBlock;
let currentBlock;
let duration = 20;
let proposalIndex = 0;
return createAcceptAndUsersPledgeForProposal(amtRaised, participatingUsersBal, hostAndCreator, importAmt, userPledgeAmt, userApproveAmt, creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress).then( function (proposalProperties){
proposalIndex = proposalProperties.proposalIndex;
amtRaised = proposalProperties.amtRaised;
startBlock = proposalProperties.startBlock;
}).then( function (ret){
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// check that proposal still underway status because min goal not reached
assert.equal(proposalState[ proposalArgKey['amountRaisedSoFar'] ].toNumber(), userPledgeAmt*participatingUsersBal.length);
function failCheck(proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['UNDERWAY_STATUS']);
}
function successCheck(proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['FAILED_STATUS']);
}
return awaitBlock(startBlock, duration, proposalIndex, crowdfundInstance.stateFail, failCheck, successCheck);
}).then( function (){
// check balance of people who didn’t pledge
return getUserBalances(nonParticipatingUsersBal)
}).then( function (data){
// user who did not participate tries to reclaim tokens
updateUserBalances(nonParticipatingUsersBal, data);
return crowdfundInstance.reclaimTokens(proposalIndex, {from: user4}) 
}).then( function (ret){
// non pledged user balance should not have changed
return getUserBalances(nonParticipatingUsersBal)
}).then( function(data){
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance, currentUserBalance)
}
updateUserBalances(nonParticipatingUsersBal, data);
// other users should still be able to reclaim funds successfully
return crowdfundInstance.reclaimTokens(proposalIndex, {from: participatingUsersBal[0].user})
}).then( function (ret){
// user should have their token balances refunded
return getUserBalances(participatingUsersBal)
}).then( function(data){
assert.equal(participatingUsersBal[0].balance + userPledgeAmt, data[0].toNumber())
assert.equal(participatingUsersBal[1].balance, data[1].toNumber())
updateUserBalances(participatingUsersBal, data)
})
})
it("host can distribute unreclaimed funds", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: 0}, {user: user2, balance: 0}];
let creator = user3;
let importAmt = 1000;
let amtRaised = 0;
let minGoal = 500;
let maxGoal = 100000;
let userPledgeAmt = minGoal/(participatingUsersBal.length*2);
let userApproveAmt = userPledgeAmt;
let hostAndCreator = [{user: host, balance: 0}, {user: creator, balance: 0}]
let startBlock;
let currentBlock;
let duration = 20;
let proposalIndex = 0;
let eventLogParticipatingUsers = [];
let pledgeEvent;
return distributeTokens(participatingUsersBal, importAmt).then( function (data){
// check that users have at least distributed balance
function check(originalUserBalance, currentUserBalance){
assert.isAtLeast(currentUserBalance, importAmt);
}
updateUserBalances(participatingUsersBal, data, check)
return getUserBalances(hostAndCreator);
}).then( function( data ) {
// check host and creator balances
updateUserBalances(hostAndCreator, data);
return createAndAcceptProposal(creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress);
}).then(function (proposalProperties){
proposalIndex = proposalProperties.proposalIndex
startBlock = proposalProperties.startBlock
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// check that proposal underway and users approve contract for token pledge amount
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['UNDERWAY_STATUS'], 'should be underway status');
return approveContract(crowdfundInstance, participatingUsersBal, userPledgeAmt);
}).then( function (){
pledgeEvent = crowdfundInstance.UserPledgedAmountAtIndex({fromBlock: 0, toBlock: 'latest'});
pledgeEvent.watch( function (err, response){
if( response.args.index.toNumber() == proposalIndex){
eventLogParticipatingUsers.push(response.args.user);
}
})
// users pledge tokens
return Promise.all(participatingUsersBal.map( function (userObj){
let user = userObj.user
amtRaised += userPledgeAmt;
return crowdfundInstance.pledgeTokens(userPledgeAmt, proposalIndex, {from: user})
}))
}).then( function (){
return getUserBalances(participatingUsersBal)
}).then( function (data){
// make sure users amt is decreased by pledge amount
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance - userPledgeAmt, currentUserBalance );
}
updateUserBalances(participatingUsersBal, data, check);
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// check that proposal still underway status because min goal not reached
assert.equal(proposalState[ proposalArgKey['amountRaisedSoFar'] ].toNumber(), userPledgeAmt*participatingUsersBal.length);
function failCheck(proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['UNDERWAY_STATUS']);
}
function successCheck(proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['FAILED_STATUS']);
}
return awaitBlock(startBlock, duration, proposalIndex, crowdfundInstance.stateFail, failCheck, successCheck);
}).then( function (){
return crowdfundInstance.redistributeTokensForAddresses(proposalIndex, eventLogParticipatingUsers, {from: host})
}).then( function (ret){
// user should have their token balances refunded
return getUserBalances(participatingUsersBal)
}).then( function(data){
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance + userPledgeAmt, currentUserBalance)
}
updateUserBalances(participatingUsersBal, data, check)
// user cant reclaim addition balance after
return crowdfundInstance.reclaimTokens(proposalIndex, {from: participatingUsersBal[1].user})
}).then( function (ret){
return getUserBalances(participatingUsersBal)
}).then( function(data){
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance, currentUserBalance)
}
pledgeEvent.stopWatching();
updateUserBalances(participatingUsersBal, data, check)
})
})
it("creator can distribute unreclaimed funds", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: 0}, {user: user2, balance: 0}];
let creator = user3;
let importAmt = 1000;
let amtRaised = 0;
let minGoal = 500;
let maxGoal = 100000;
let userPledgeAmt = minGoal/(participatingUsersBal.length*2);
let hostAndCreator = [{user: host, balance: 0}, {user: creator, balance: 0}]
let startBlock;
let currentBlock;
let duration = 20;
let proposalIndex = 0;
let eventLogParticipatingUsers = [];
let pledgeEvent;
return distributeTokens(participatingUsersBal, importAmt).then( function (data){
// check that users have at least distributed balance
function check(originalUserBalance, currentUserBalance){
assert.isAtLeast(currentUserBalance, importAmt);
}
updateUserBalances(participatingUsersBal, data, check)
return getUserBalances(hostAndCreator);
}).then( function( data ) {
// check host and creator balances
updateUserBalances(hostAndCreator, data);
return createAndAcceptProposal(creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress);
}).then(function (proposalProperties){
proposalIndex = proposalProperties.proposalIndex
startBlock = proposalProperties.startBlock
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// check that proposal underway and users approve contract for token pledge amount
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['UNDERWAY_STATUS'], 'should be underway status');
return approveContract(crowdfundInstance, participatingUsersBal, userPledgeAmt);
}).then( function (){
pledgeEvent = crowdfundInstance.UserPledgedAmountAtIndex({fromBlock: 0, toBlock: 'latest'});
pledgeEvent.watch( function (err, response){
if( response.args.index.toNumber() == proposalIndex){
eventLogParticipatingUsers.push(response.args.user);
}
})
// users pledge tokens
return Promise.all(participatingUsersBal.map( function (userObj){
let user = userObj.user
amtRaised += userPledgeAmt;
return crowdfundInstance.pledgeTokens(userPledgeAmt, proposalIndex, {from: user})
}))
}).then( function (){
return getUserBalances(participatingUsersBal)
}).then( function (data){
// make sure users amt is decreased by pledge amount
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance - userPledgeAmt, currentUserBalance );
}
updateUserBalances(participatingUsersBal, data, check);
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (ret){
ret = ret
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// check that proposal still underway status because min goal not reached
assert.equal(proposalState[ proposalArgKey['amountRaisedSoFar'] ].toNumber(), userPledgeAmt*participatingUsersBal.length);
function failCheck(proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['UNDERWAY_STATUS']);
}
function successCheck(proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['FAILED_STATUS']);
}
return awaitBlock(startBlock, duration, proposalIndex, crowdfundInstance.stateFail, failCheck, successCheck);
}).then( function (){
return crowdfundInstance.redistributeTokensForAddresses(proposalIndex, eventLogParticipatingUsers, {from: creator})
}).then( function (ret){
// user should have their token balances refunded
return getUserBalances(participatingUsersBal)
}).then( function(data){
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance + userPledgeAmt, currentUserBalance)
}
updateUserBalances(participatingUsersBal, data, check)
// user cant reclaim addition balance after
return crowdfundInstance.reclaimTokens(proposalIndex, {from: participatingUsersBal[1].user})
}).then( function (ret){
return getUserBalances(participatingUsersBal)
}).then( function(data){
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance, currentUserBalance)
}
pledgeEvent.stopWatching();
updateUserBalances(participatingUsersBal, data, check)
})
})
it("creator cannot redistribute funds to bad addresses", function() {
let proposal;
let participatingUsersBal = [{user: user1, balance: 0}, {user: user2, balance: 0}];
let creator = user3;
let importAmt = 1000;
let amtRaised = 0;
let minGoal = 500;
let maxGoal = 100000;
let userPledgeAmt = minGoal/(participatingUsersBal.length*2);
let hostAndCreator = [{user: host, balance: 0}, {user: creator, balance: 0}]
let startBlock;
let currentBlock;
let duration = 20;
let proposalIndex = 0;
let eventLogParticipatingUsers = [];
let pledgeEvent;
return distributeTokens(participatingUsersBal, importAmt).then( function (data){
// check that users have at least distributed balance
function check(originalUserBalance, currentUserBalance){
assert.isAtLeast(currentUserBalance, importAmt);
}
updateUserBalances(participatingUsersBal, data, check)
return getUserBalances(hostAndCreator);
}).then( function( data ) {
// check host and creator balances
updateUserBalances(hostAndCreator, data);
return createAndAcceptProposal(creator, host, title, description, minGoal, maxGoal, hostCut, duration, tokenAddress);
}).then(function (proposalProperties){
proposalIndex = proposalProperties.proposalIndex
startBlock = proposalProperties.startBlock
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// check that proposal underway and users approve contract for token pledge amount
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['UNDERWAY_STATUS'], 'should be underway status');
return approveContract(crowdfundInstance, participatingUsersBal, userPledgeAmt);
}).then( function (){
pledgeEvent = crowdfundInstance.UserPledgedAmountAtIndex({fromBlock: 0, toBlock: 'latest'});
pledgeEvent.watch( function (err, response){
if( response.args.index.toNumber() == proposalIndex){
eventLogParticipatingUsers.push(response.args.user);
}
})
// users pledge tokens
return Promise.all(participatingUsersBal.map( function (userObj){
let user = userObj.user
amtRaised += userPledgeAmt;
return crowdfundInstance.pledgeTokens(userPledgeAmt, proposalIndex, {from: user})
}))
}).then( function (){
return getUserBalances(participatingUsersBal)
}).then( function (data){
// make sure users amt is decreased by pledge amount
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance - userPledgeAmt, currentUserBalance );
}
updateUserBalances(participatingUsersBal, data, check);
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (ret){
ret = ret
return crowdfundInstance.ideas.call(proposalIndex)
}).then( function (proposalState){
// check that proposal still underway status because min goal not reached
assert.equal(proposalState[ proposalArgKey['amountRaisedSoFar'] ].toNumber(), userPledgeAmt*participatingUsersBal.length);
function failCheck(proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['UNDERWAY_STATUS']);
}
function successCheck(proposalState){
assert.equal(proposalState[ proposalArgKey['status'] ].toNumber(), statusKey['FAILED_STATUS']);
}
return awaitBlock(startBlock, duration, proposalIndex, crowdfundInstance.stateFail, failCheck, successCheck);
}).then( function (){
return crowdfundInstance.redistributeTokensForAddresses(proposalIndex, ['0x5c8ba4999200ab3d7ef12b4dd88dd5f39870aba'], {from: creator})
}).then( function (ret){
// user should not have their token balances refunded
return getUserBalances(participatingUsersBal)
}).then( function(data){
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance, currentUserBalance)
}
updateUserBalances(participatingUsersBal, data, check)
// user reclaim their tokens after
return crowdfundInstance.reclaimTokens(proposalIndex, {from: participatingUsersBal[1].user})
}).then( function (ret){
return crowdfundInstance.reclaimTokens(proposalIndex, {from: participatingUsersBal[0].user})
}).then( function (ret){
return getUserBalances(participatingUsersBal)
}).then( function(data){
function check(originalUserBalance, currentUserBalance){
assert.equal(originalUserBalance + userPledgeAmt, currentUserBalance)
}
pledgeEvent.stopWatching();
updateUserBalances(participatingUsersBal, data, check)
})
})
})