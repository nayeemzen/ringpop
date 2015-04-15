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

var Membership = require('./membership');

function Disseminator(opts) {
    this.swim = opts.swim;

    this.disseminationFactor = opts.disseminationFactor || Disseminator.Default.disseminationFactor;
    this.disseminationFormula =  opts.disseminationFormula || Disseminator.Default.disseminationFormula;
    this.disseminationLimit = Disseminator.Default.disseminationLimit;

    this.updateListener = this.onUpdate.bind(this);
    this.changeListener = this.onChange.bind(this);

    this.attemptsToUpdates = Object.create(null);
    this.addressToAttempts = Object.create(null);
}

util.inherits(Disseminator, events.EventEmitter);

Disseminator.prototype.start = function start() {
    this.swim.membership.on(Membership.EventType.Change, this.changeListener);
    this.swim.membership.on(Membership.EventType.Update, this.updateListener);
    this.updateDisseminationLimit();
};

Disseminator.prototype.stop = function stop() {
    this.swim.membership.removeListener(Membership.EventType.Change, this.changeListener);
    this.swim.membership.removeListener(Membership.EventType.Update, this.updateListener);
};

Disseminator.prototype.onChange = function onChange() {
    this.updateDisseminationLimit();
};

Disseminator.prototype.updateDisseminationLimit = function updateDisseminationLimit() {
    var self = this;

    self.disseminationLimit = self.disseminationFormula(self.disseminationFactor, self.swim.membership.size(true));

    Object.keys(self.attemptsToUpdates).forEach(function removeAttempts(attempts) {
        if (attempts >= self.disseminationLimit) {
            Object.keys(self.attemptsToUpdates[attempts]).forEach(function removeUpdate(address) {
                delete self.addressToAttempts[address];
            });

            delete self.attemptsToUpdates[attempts];
        }
    });
};

Disseminator.prototype.onUpdate = function onUpdate(data) {
    var update = {
        attempts: 0;
        meta: data.meta,
        address: data.address,
        state: data.state,
        incarnation: data.incarnation
    };

    this.removeUpdate(update);
    this.addUpdate(update);
};

Disseminator.prototype.addUpdate = function addUpdate(update) {
    if (update.attempts >= this.disseminationLimit) {
        return;
    }

    if (!this.attemptsToUpdates[update.attempts]) {
        this.attemptsToUpdates[update.attempts] = Object.create(null);
    }

    this.attemptsToUpdates[update.attempts][update.address] = update;
    this.addressToAttempts[update.address] = update.attempts;
};

Disseminator.prototype.removeUpdate = function removeUpdate(update) {
    if (this.addressToAttempts[update.address] >= 0) {
        delete this.attemptsToUpdates[this.addressToAttempts[update.address]][update.address];
    }

    delete this.addressToAttempts[update.address];
};

Disseminator.prototype.getUpdatesUpTo = function getUpdatesUpTo(numOfUpdates) {
    // TODO
};

Disseminator.Default = {
    disseminationFactor: 15,
    disseminationLimit: 3,
    disseminationFormula: function disseminationFormula(factor, size) {
        return Math.ceil(factor * Math.log(size + 1) / Math.log(10));
    }
};

module.exports = Disseminator;
