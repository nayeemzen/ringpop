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

var Member = require('./member.js');

var LOG_10 = Math.log(10);

function Dissemination(ringpop) {
    this.ringpop = ringpop;
    this.ringpop.on('changed', this.onRingChanged.bind(this));

    this.changes = {};
    this.maxPiggybackCount = 1;
    this.piggybackFactor = 15; // A lower piggyback factor leads to more full-syncs
}

Dissemination.prototype.adjustMaxPiggybackCount = function adjustMaxPiggybackCount() {
    var serverCount = this.ringpop.ring.getServerCount();
    var prevPiggybackCount = this.maxPiggybackCount;
    var newPiggybackCount = this.piggybackFactor * Math.ceil(Math.log(serverCount + 1) / LOG_10);

    if (this.maxPiggybackCount !== newPiggybackCount) {
        this.maxPiggybackCount = newPiggybackCount;
        this.ringpop.stat('gauge', 'max-piggyback', this.maxPiggybackCount);
        this.ringpop.logger.debug('adjusted max piggyback count', {
            newPiggybackCount: this.maxPiggybackCount,
            oldPiggybackCount: prevPiggybackCount,
            piggybackFactor: this.piggybackFactor,
            serverCount: serverCount
        });
    }
};

Dissemination.prototype.fullSync = function fullSync() {
    var changes = [];

    for (var i = 0; i < this.ringpop.membership.members.length; i++) {
        var member = this.ringpop.membership.members[i];

        changes.push({
            source: this.ringpop.whoami(),
            address: member.address,
            status: member.status,
            incarnationNumber: member.incarnationNumber
        });
    }

    return changes;
};

Dissemination.prototype.issueChanges = function issueChanges(checksum, source) {
    var changedNodes = Object.keys(this.changes);
    var changesToDisseminate = [];

    for (var i = 0; i < changedNodes.length; i++) {
        var address = changedNodes[i];
        var change = this.changes[address];

        // TODO We're bumping the piggyback count even though
        // we don't know whether the change successfully made
        // it over to the other side. This can result in undesired
        // full-syncs.
        if (typeof change.piggybackCount === 'undefined') {
            change.piggybackCount = 0;
        }

        change.piggybackCount += 1;

        if (change.piggybackCount > this.maxPiggybackCount) {
            delete this.changes[address];
            continue;
        }

        var changeToDisseminate = {
            source: change.source,
            address: change.address,
            status: change.status,
            incarnationNumber: change.incarnationNumber
        };

        // Special handling for damped changes that need
        // dissemination.
        if (change.status === Member.Status.damped) {
            changeToDisseminate.dampScore = change.dampScore;
            changeToDisseminate.timestamp = change.timestamp;
        }

        changesToDisseminate.push(changeToDisseminate);
    }

    this.ringpop.stat('gauge', 'changes.disseminate', changesToDisseminate.length);

    if (changesToDisseminate.length > 0) {
        return changesToDisseminate;
    }

    // Perform full-sync only if there are no changes left to disseminate
    // and checksums still don't match!
    if (checksum && this.ringpop.membership.checksum !== checksum) {
        this.ringpop.stat('increment', 'full-sync');
        this.ringpop.logger.info('full sync', {
            local: this.ringpop.whoami(),
            localChecksum: this.ringpop.membership.checksum,
            remoteChecksum: checksum,
            remoteNode: source
        });

        // TODO Somehow send back indication of isFullSync
        return this.fullSync();
    }

    return [];
};

Dissemination.prototype.onRingChanged = function onRingChanged() {
    this.adjustMaxPiggybackCount();
};

Dissemination.prototype.recordChange = function recordChange(change) {
    this.changes[change.address] = change;
};

module.exports = Dissemination;
