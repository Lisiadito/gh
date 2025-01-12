/**
 * © 2013 Liferay, Inc. <https://liferay.com> and Node GH contributors
 * (see file: README.md)
 * SPDX-License-Identifier: BSD-3-Clause
 */

import * as stripAnsi from 'strip-ansi'
import { runCmd } from './testUtils'

describe('E2E: Repo Module Test', () => {
    it('List Repos `gh re --list`', done => {
        expect(runCmd('gh re --list')).toMatchSnapshot()
        done()
    })

    it('List Repos `gh re --browser`', done => {
        expect(runCmd('gh re --browser')).toMatchSnapshot()
        done()
    })

    it('Create new repo `gh re --new foo --init`', done => {
        expect(runCmd('gh re --new foo --init')).toMatchSnapshot()
        done()
    })

    it('List labels on a repo `gh re --label --list --repo gh`', done => {
        expect(runCmd('gh re --label --list --repo gh')).toMatchSnapshot()
        done()
    })

    it('Fork a repo `gh re --fork prettier --user prettier`', done => {
        expect(runCmd('gh re --fork prettier --user prettier')).toMatchSnapshot()
        done()
    })

    it('Delete repo `gh re --delete foo`', done => {
        expect(stripAnsi(runCmd('printf "y" | gh re --delete foo'))).toMatchSnapshot()
        done()
    })
})
