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

var errors = require('./errors.js');
var TypedError = require('error/typed');

var RedundantLeaveError = TypedError({
    type: 'ringpop.invalid-leave.redundant',
    message: 'A node cannot leave its cluster when it has already left.'
});

module.exports = function recvAdminLeave(opts, callback) {
    var ringpop = opts.ringpop;

    if (!ringpop.membership.localMember) {
        process.nextTick(function() {
            callback(errors.InvalidLocalMemberError());
        });
        return;
    }

    if (ringpop.membership.localMember.status === 'leave') {
        process.nextTick(function() {
            callback(RedundantLeaveError());
        });
        return;
    }

    // TODO Explicitly infect other members (like admin join)?
    ringpop.membership.makeLeave(ringpop.whoami(),
        ringpop.membership.localMember.incarnationNumber);

    ringpop.gossip.stop();
    ringpop.suspicion.stopAll();

    process.nextTick(function() {
        callback(null, null, 'ok');
    });
};
