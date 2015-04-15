// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
'use strict';
var events = require('events');
var util = require('util');

var Net = require('./net');

function FailureDetector(opts) {
    this.swim = opts.swim;

    this.interval = opts.interval || FailureDetector.Default.interval;
    this.pingTimeout = opts.pingTimeout || FailureDetector.Default.pingTimeout;
    this.pingReqTimeout = opts.pingReqTimeout || FailureDetector.Default.pingReqTimeout;
    this.pingReqGroupSize = opts.pingReqGroupSize || FailureDetector.Default.pingReqGroupSize;

    this.pingListener = this.onPing.bind(this);
    this.pingTimeoutListener = this.onPingTimeout.bind(this);
    this.pingReqListener = this.onPingReq.bind(this);
    this.pingReqTimeoutListener = this.onPingReqTimeout.bind(this);

    this.tickHandle = undefined;

    this.addressToPingReqTimeout = Object.create(null);
}

util.inherits(FailureDetector, events.EventEmitter);

FailureDetector.prototype.start = function start() {
    this.swim.net.on(Net.EventType.Ping, this.pingListener);
    this.swim.net.on(Net.EventType.PingTimeout, this.pingTimeoutListener);
    this.swim.net.on(Net.EventType.PingReq, this.pingReqListener);
    this.swim.net.on(Net.EventType.PingReqTimeout, this.pingReqTimeoutListener);
    this.tick();
};

FailureDetector.prototype.stop = function stop() {
    var self = this;

    clearInterval(self.tickHandle);
    self.tickHandle = undefined;

    self.swim.net.removeListener(Net.EventType.Ping, self.pingListener);
    self.swim.net.removeListener(Net.EventType.PingReq, self.pingReqListener);
    self.swim.net.removeListener(Net.EventType.Ack, self.ackListener);
};

FailureDetector.prototype.tick = function tick() {
    setImmediate(this.ping.bind(this));
    this.tickHandle = setInterval(this.ping.bind(this), this.interval);
};

FailureDetector.prototype.ping = function ping() {
    var member = this.swim.membership.next();

    if (member) {
        this.pingMember(member);
    }
};

FailureDetector.prototype.pingMember = function pingMember(member) {
    this.swim.net.ping(member.address, this.swim.disseminator.getPiggybackUpdates(), this.swim.membership.checksum());
};

FailureDetector.prototype.pingReq = function pingReq(member) {
    var self = this;
    var relayMembers = self.swim.membership.random(self.pingReqGroupSize);

    if (relayMembers.length === 0) {
        return;
    }

    self.addressToPingReqTimeout = setTimeout(function PingReqTimeout() {
        self.emit(FailureDetector.EventType.Suspect, member);
    }, self.pingReqTimeout);

    relayMembers.forEach(function pingThrough(relayMember) {
        self.pingReqThroughMember(member, relayMember);
    });
};

FailureDetector.prototype.pingReqThroughMember = function pingReqThroughMember(member, relayMember) {
    this.swim.net.pingReq(replayMember.address, member.address,
                          this.swim.disseminator.getPiggybackUpdates(), this.swim.membership.checksum());
};

FailureDetector.prototype.onPing = function onPing(data, address) {
};

FailureDetector.prototype.onPingTimeout = function onPingTimeout(data, address) {
};

FailureDetector.prototype.onPing = function onPing(data, address) {
};

FailureDetector.prototype.onPingReqTimeout = function onPingReqTimeout(data, address) {
};

FailureDetector.Default = {
    interval: 100,
    pingTimeout: 20,
    pingReqTimeout: 40,
    pingReqGroupSize: 3
};

FailureDetector.EventType = {
    Suspect: 'suspect'
};

module.exports = FailureDetector;
