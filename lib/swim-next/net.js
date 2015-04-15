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

function Net(opts) {
    this.swim = opts.swim;
    this.tchannel = opts.tchannel;

    this.pingHandler = this.onPing.bind(this);
    this.pingReqHandler = this.onPingReq.bind(this);
    this.syncHandler = this.onSync.bind(this);
}

util.inherits(Net, events.EventEmitter);

Net.prototype.start = function start() {
    this.tchannel.register('/ping', this.pingHandler);
    this.tchannel.register('/ping-req', this.pingReqHandler);
    this.tchannel.register('/sync', this.syncHandler);
};

Net.prototype.stop = function stop() {
    this.tchannel.deregister('/ping', this.pingHandler);
    this.tchannel.deregister('/ping-req', this.pingReqHandler);
    this.tchannel.deregister('/sync', this.syncHandler);
};

Net.prototype.ping = function ping(address, updates, checksum) {
    // TODO
};

Net.prototype.pingReq = function pingReq(address, target, updates, checksum) {
    // TODO
};

Net.prototype.onPing = function onPing(buffer, address) {
    // TODO
};

Net.prototype.onPingReq = function onPingReq(buffer, address) {
    // TODO
};

Net.prototype.onSync = function onSync(buffer, address) {
    // TODO
};

Net.EventType = {
    Ping: 'ping',
    PingTimeout: 'ping-timeout',
    PingReq: 'ping-req',
    PingReq: 'ping-req-timeout',
    Sync: 'sync',
    SyncTimeout: 'sync-timeout',
    Ack: 'ack',
    Update: 'update'
};

module.exports = Net;
