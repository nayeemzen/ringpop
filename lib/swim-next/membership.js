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
var farmhash = require('farmhash');
var util = require('util');

var FailureDetector = require('./failure-detector');
var Member = require('./member');
var MessageType = require('./message-type');
var Net = require('./net');

function Membership(opts) {
    this.swim = opts.swim;
    this.local = new Member(opts.local);
    this.suspectTimeout = opts.suspectTimeout || Membership.Default.suspectTimeout;

    this.ackListener = this.onAck.bind(this);
    this.updateListener = this.onUpdate.bind(this);
    this.suspectListener = this.onSuspect.bind(this);
    this.syncListener = this.onSync.bind(this);

    this.addressToMember = Object.create(null);
    this.addressToIterable = Object.create(null);
    this.addressToFaulty = Object.create(null);
    this.addressToSuspectTimeout = Object.create(null);
}

util.inherits(Membership, events.EventEmitter);

Membership.prototype.start = function start() {
    var self = this;

    self.swim.failureDetector.on(FailureDetector.EventType.Suspect, self.suspectListener);
    self.swim.net.on(Net.EventType.Ack, self.ackListener);
    self.swim.net.on(Net.EventType.Sync, self.syncListener);
    self.swim.net.on(Net.EventType.Update, self.updateListener);

    Object.keys(self.addressToSuspectTimeout).forEach(function resumeSuspect(address) {
        self.onSuspect(self.get(address));
    });
};

Membership.prototype.stop = function stop() {
    var self = this;

    self.swim.failureDetector.removeListener(FailureDetector.EventType.Suspect, self.suspectListener);
    self.swim.net.removeListener(Net.EventType.Ack, self.ackListener);
    self.swim.net.removeListener(Net.EventType.Sync, self.syncListener);
    self.swim.net.removeListener(Net.EventType.Update, self.updateListener);

    Object.keys(self.addressToSuspectTimeout).forEach(function clearTimeoutWithoutDeletion(address) {
        clearTimeout(self.addressToSuspectTimeout[address]);
    });
};

Membership.prototype.onAck = function onAck(data, address) {
    if (this.addressToMember[address] && this.addressToMember[address].state === Member.State.Suspect) {
        this.swim.net.sendMessage({
            type: MessageType.Update,
            data: this.addressToMember[address].data()
        }, address);
    }
};

Membership.prototype.onSuspect = function onSuspect(member) {
    var self = this;
    var data;

    member = new Member(member.data());
    member.state = Member.State.Suspect;
    data = member.data();

    clearTimeout(self.addressToSuspectTimeout[data.address]);
    delete self.addressToSuspectTimeout[data.address];

    self.addressToSuspectTimeout[data.address] = setTimeout(function setFaulty() {
        delete self.addressToSuspectTimeout[data.address];

        data.state = Member.State.Faulty;

        self.onUpdate(data);
    }, self.suspectTimeout);

    self.onUpdate(member.data());
};

Membership.prototype.onSync = function onSync(data, address) {
    if (data.address !== address) {
        this.emit(Membership.EventType.Drop, data);
        return;
    }

    if (this.addressToMember[address] && this.addressToMember[address].incarnation >= data.incarnation) {
        this.swim.net.sendMessage({
            type: MessageType.Update,
            data: this.addressToMember[address].data()
        }, address);
    }

    delete this.addressToFaulty[address];
    this.addressToMember[address] = new Member(data);
    this.addressToIterable[address] = this.addressToMember[address];
    this.emit(Membership.EventType.Update, this.addressToMember[address]);

    this.swim.net.sendMessages(this.all(true).map(function toMessage(data) {
        return {
            type: MessageType.Update,
            data: data
        };
    }), address);
};

Membership.prototype.sync = function sync(addresss) {
    var self = this;
    var messages = [{
        type: MessageType.Sync,
        data: self.local.data()
    }];

    this.all().forEach(function addMessage(data) {
        messages.push({
            type: MessageType.Update,
            data: data
        });
    });

    addresss.forEach(function sendToHost(address) {
        self.swim.net.sendMessages(messages, address);
    });
};

Membership.prototype.onUpdate = function onUpdate(data) {
    switch (data.state) {
        case Member.State.Alive:
            this.updateAlive(data);
            break;
        case Member.State.Suspect:
            this.updateSuspect(data);
            break;
        case Member.State.Faulty:
            this.updateFaulty(data);
            break;
    }
};

Membership.prototype.updateAlive = function updateAlive(data) {
    if (this.isLocal(data.address)) {
        if (this.local.incarnate(data)) {
            this.emit(Membership.EventType.Update, this.local.data());
        } else {
            this.emit(Membership.EventType.Drop, data);
        }
        return;
    }

    if (this.addressToFaulty[data.address] && this.addressToFaulty[data.address].incarnation >= data.incarnation) {
        this.emit(Membership.EventType.Drop, data);
        return;
    }

    if (!this.addressToMember[data.address] ||
        data.incarnation > this.addressToMember[data.address].incarnation) {

        clearTimeout(this.addressToSuspectTimeout[data.address]);
        delete this.addressToSuspectTimeout[data.address];
        delete this.addressToFaulty[data.address];

        if (!this.addressToMember[data.address]) {
            this.addressToMember[data.address] = new Member(data);
            this.addressToIterable[data.address] = this.addressToMember[data.address];
            this.emit(Membership.EventType.Change, this.addressToMember[data.address].data());
        } else {
            this.addressToMember[data.address] = new Member(data);
        }

        this.emit(Membership.EventType.Update, this.addressToMember[data.address].data());
    } else {
        this.emit(Membership.EventType.Drop, data);
    }
};

Membership.prototype.updateSuspect = function updateSuspect(data) {
    if (this.isLocal(data.address)) {
        this.emit(Membership.EventType.Drop, data);
        this.local.incarnate(data, true);
        this.emit(Membership.EventType.Update, this.local.data());
        return;
    }

    if (this.addressToFaulty[data.address] && this.addressToFaulty[data.address].incarnation >= data.incarnation) {
        this.emit(Membership.EventType.Drop, data);
        return;
    }

    if (!this.addressToMember[data.address] ||
        data.incarnation > this.addressToMember[data.address].incarnation ||
        data.incarnation === this.addressToMember[data.address].incarnation &&
        this.addressToMember[data.address].state === Member.State.Alive) {

        delete this.addressToFaulty[data.address];

        if (!this.addressToMember[data.address]) {
            this.addressToMember[data.address] = new Member(data);
            this.addressToIterable[data.address] = this.addressToMember[data.address];
            this.emit(Membership.EventType.Change, this.addressToMember[data.address].data());
        } else {
            this.addressToMember[data.address] = new Member(data);
        }

        this.emit(Membership.EventType.Update, this.addressToMember[data.address].data());
    } else {
        this.emit(Membership.EventType.Drop, data);
    }
};

Membership.prototype.updateFaulty = function updateFaulty(data) {
    if (this.isLocal(data.address)) {
        this.emit(Membership.EventType.Drop, data);
        this.local.incarnate(data, true);
        this.emit(Membership.EventType.Update, this.local.data());
        return;
    }

    if (this.addressToMember[data.address] &&
        data.incarnation >= this.addressToMember[data.address].incarnation) {

        this.addressToFaulty[data.address] = new Member(data);
        delete this.addressToMember[data.address];

        if (this.addressToMember[data.address]) {
            delete this.addressToIterable[data.address];
            this.emit(Membership.EventType.Change, data);
        }

        this.emit(Membership.EventType.Update, data);
    } else {
        this.emit(Membership.EventType.Drop, data);
    }
};

Membership.prototype.next = function next() {
    var addresss = Object.keys(this.addressToIterable);
    var address;
    var member;

    if (addresss.length === 0) {
        this.shuffle();
        addresss = Object.keys(this.addressToIterable);
    }

    address = addresss[Math.floor(Math.random() * addresss.length)];
    member = this.addressToIterable[address];
    delete this.addressToIterable[address];

    return member;
};

Membership.prototype.random = function random(n) {
    var addresss = Object.keys(this.addressToMember);
    var selected = [];
    var index;
    var i;

    for (i = 0; i < n && i < addresss.length; i++) {
        index = i + Math.floor(Math.random() * (addresss.length - i));
        selected.push(this.addressToMember[addresss[index]]);
        addresss[index] = addresss[i];
    }

    return selected;
};

Membership.prototype.shuffle = function shuffle() {
    var self = this;

    self.addressToIterable = Object.create(null);

    Object.keys(self.addressToMember).forEach(function addToIterable(address) {
        self.addressToIterable[address] = self.addressToMember[address];
    });
};

Membership.prototype.get = function get(address) {
    return this.addressToMember[address];
};

Membership.prototype.size = function size(hasLocal) {
    return Object.keys(this.addressToMember).length + (hasLocal ? 1 : 0);
};

Membership.prototype.all = function all(hasLocal) {
    var self = this;
    var results = Object.keys(self.addressToMember).map(function toData(address) {
        return self.addressToMember[address].data();
    });

    if (hasLocal) {
        results.push(self.local.data());
    }

    return results;
};

Membership.prototype.checksum = function checksum() {
    var self = this;
    var strs = self.all(true).sort(function compare(a, b) {
        return parseInt(a.address.split(':')[1]) - parseInt(b.address.split(':')[1]);
    }).map(function toString(member) {
        return member.address + member.state + member.incarnation;
    });

    return farmhash.hash64(strs.join('-'));
};

Membership.prototype.isLocal = function isLocal(address) {
    return address === this.local.address;
};

Membership.prototype.localaddress = function localaddress() {
    return this.local.address;
};

Membership.Default = {
    suspectTimeout: 200
};

Membership.EventType = {
    Change: 'change',
    Drop: 'drop',
    Update: 'update'
};

module.exports = Membership;
