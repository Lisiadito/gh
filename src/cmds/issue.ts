/**
 * © 2013 Liferay, Inc. <https://liferay.com> and Node GH contributors
 * (see file: README.md)
 * SPDX-License-Identifier: BSD-3-Clause
 */

// -- Requires -------------------------------------------------------------------------------------

import { isArray } from 'lodash'
import { openUrl } from '../utils'
import * as base from '../base'
import { getGitHubInstance } from '../github'
import { afterHooks, beforeHooks } from '../hooks'
import * as logger from '../logger'
import { hasCmdInOptions } from '../utils'

const config = base.getConfig()
const testing = process.env.NODE_ENV === 'testing'

// -- Constructor ----------------------------------------------------------------------------------

export default function Issue(options) {
    this.options = options

    if (!options.repo && !options.all) {
        logger.error('You must specify a Git repository with a GitHub remote to run this command')
    }
}

// -- Constants ------------------------------------------------------------------------------------

Issue.DETAILS = {
    alias: 'is',
    description: 'Provides a set of util commands to work with Issues.',
    iterative: 'number',
    commands: ['assign', 'browser', 'close', 'comment', 'list', 'new', 'open', 'search'],
    options: {
        all: Boolean,
        assign: Boolean,
        assignee: String,
        browser: Boolean,
        close: Boolean,
        comment: String,
        date: String,
        detailed: Boolean,
        labels: [String],
        list: Boolean,
        link: Boolean,
        message: String,
        milestone: [Number, String],
        'no-milestone': Boolean,
        new: Boolean,
        number: [String, Array],
        open: Boolean,
        remote: String,
        repo: String,
        search: String,
        state: ['open', 'closed'],
        title: String,
        user: String,
    },
    shorthands: {
        a: ['--all'],
        A: ['--assignee'],
        B: ['--browser'],
        C: ['--close'],
        c: ['--comment'],
        d: ['--detailed'],
        L: ['--labels'],
        k: ['--link'],
        l: ['--list'],
        m: ['--message'],
        M: ['--milestone'],
        N: ['--new'],
        n: ['--number'],
        o: ['--open'],
        r: ['--repo'],
        s: ['--search'],
        S: ['--state'],
        t: ['--title'],
        u: ['--user'],
    },
}

Issue.STATE_CLOSED = 'closed'
Issue.STATE_OPEN = 'open'

// -- Commands -------------------------------------------------------------------------------------

Issue.prototype.run = async function(done) {
    const instance = this
    const options = instance.options
    const number = logger.colors.green(`#${options.number}`)

    instance.config = config
    instance.GitHub = await getGitHubInstance()

    options.state = options.state || Issue.STATE_OPEN

    if (!hasCmdInOptions(Issue.DETAILS.commands, options)) {
        const payload = options.argv.remain && options.argv.remain.slice(1)

        if (payload && payload[0]) {
            if (/^\d+$/.test(payload[0])) {
                options.browser = true
                options.number = payload[0]
                return
            }

            options.new = true
            options.title = options.title || payload[0]
            options.message = options.message || payload[1]
        } else {
            options.list = true
        }
    }

    if (options.assign) {
        await beforeHooks('issue.assign', instance)

        logger.log(
            `Assigning issue ${number} on ${getUserRepo(options)} to ${logger.colors.magenta(
                options.assignee
            )}`
        )

        try {
            var { data } = await instance.assign()
        } catch (err) {
            throw new Error(`Can't assign issue.\n${err}`)
        }

        logger.log(logger.colors.cyan(data.html_url))

        await afterHooks('issue.assign', instance)
    }

    if (options.browser) {
        instance.browser(options.user, options.repo, options.number)
    }

    if (options.comment) {
        logger.log(`Adding comment on issue ${number} on ${getUserRepo(options)}`)

        try {
            var { data } = await instance.comment()
        } catch (err) {
            throw new Error(`Can't add comment.\n${err}`)
        }

        logger.log(logger.colors.cyan(data.html_url))
    }

    if (options.list) {
        try {
            if (options.all) {
                logger.log(
                    `Listing ${logger.colors.green(options.state)} issues for ${logger.colors.green(
                        options.user
                    )}`
                )

                await instance.listFromAllRepositories()
            } else {
                logger.log(
                    `Listing ${logger.colors.green(options.state)} issues on ${getUserRepo(
                        options
                    )}`
                )

                await instance.list(options.user, options.repo)
            }
        } catch (err) {
            throw new Error(`Error listing issues\n${err}`)
        }
    }

    if (options.new) {
        await beforeHooks('issue.new', instance)

        logger.log(`Creating a new issue on ${getUserRepo(options)}`)

        try {
            var { data } = await instance.new()
        } catch (err) {
            throw new Error(`Can't create issue.\n${err}`)
        }

        if (data) {
            options.number = data.number
        }

        logger.log(data.html_url)

        await afterHooks('issue.new', instance)
    }

    if (options.open) {
        await beforeHooks('issue.open', instance)

        await openHandler(instance, options)

        await afterHooks('issue.open', instance)
    } else if (options.close) {
        await beforeHooks('issue.close', instance)

        await closeHandler(instance, options)

        await afterHooks('issue.close', instance)
    }

    if (options.search) {
        let { repo, user } = options
        const query = logger.colors.green(options.search)

        if (options.all) {
            repo = undefined

            logger.log(`Searching for ${query} in issues for ${logger.colors.green(user)}\n`)
        } else {
            logger.log(`Searching for ${query} in issues for ${getUserRepo(options)}\n`)
        }

        try {
            await instance.search(user, repo)
        } catch (err) {
            throw new Error(`Can't search issues for ${getUserRepo(options)}: \n${err}`)
        }
    }

    done && done()
}

Issue.prototype.assign = async function() {
    const instance = this

    const issue = await instance.getIssue_()

    return instance.editIssue_(issue.title, Issue.STATE_OPEN)
}

Issue.prototype.browser = function(user, repo, number) {
    if (!number) {
        number = ''
    }

    openUrl(`${config.github_host}/${user}/${repo}/issues/${number}`)
}

Issue.prototype.close = async function(number) {
    var instance = this

    const issue = await instance.getIssue_(number)

    return instance.editIssue_(issue.title, Issue.STATE_CLOSED, number)
}

Issue.prototype.comment = function() {
    const instance = this
    let options = instance.options

    const body = logger.applyReplacements(options.comment, config.replace) + config.signature

    const payload = {
        body,
        issue_number: options.number,
        repo: options.repo,
        owner: options.user,
    }

    return instance.GitHub.issues.createComment(payload)
}

Issue.prototype.editIssue_ = function(title, state, number?: number) {
    const instance = this
    const options = instance.options
    let payload

    payload = {
        state,
        title,
        assignee: options.assignee,
        labels: options.labels || [],
        milestone: options.milestone,
        issue_number: number || options.number,
        owner: options.user,
        repo: options.repo,
    }

    return instance.GitHub.issues.update(payload)
}

Issue.prototype.getIssue_ = function(number?: number) {
    const instance = this
    const options = instance.options

    const payload = {
        issue_number: number || options.number,
        repo: options.repo,
        owner: options.user,
    }

    return instance.GitHub.issues.get(payload)
}

Issue.prototype.list = async function(user, repo) {
    const instance = this
    const options = instance.options
    let payload

    payload = {
        repo,
        owner: user,
        state: options.state,
    }

    if (options.labels) {
        payload.labels = options.labels
    }

    if (options['no-milestone']) {
        payload.milestone = 'none'
    }

    if (options.milestone) {
        const data = await instance.GitHub.paginate(
            instance.GitHub.issues.listMilestonesForRepo.endpoint({
                repo,
                owner: user,
            })
        )

        const milestoneNumber = data
            .filter(milestone => options.milestone === milestone.title)
            .map(milestone => milestone.number)[0]

        payload.milestone = `${milestoneNumber}`
    }

    if (options.assignee) {
        payload.assignee = options.assignee
    }

    const data = await instance.GitHub.paginate(
        instance.GitHub.issues.listForRepo.endpoint(payload)
    )

    const issues = data.filter(result => Boolean(result))

    if (issues && issues.length > 0) {
        const formattedIssues = formatIssues(issues, options.detailed)
        options.all
            ? logger.log(`\n${getUserRepo(options)}:\n${formattedIssues}`)
            : logger.log(formattedIssues)
    } else {
        logger.log(`\nNo issues on ${getUserRepo(options)}`)
    }
}

Issue.prototype.listFromAllRepositories = async function() {
    const instance = this
    const options = instance.options

    const payload = {
        type: 'all',
        username: options.user,
    }

    const repositories: any = await instance.GitHub.paginate(
        instance.GitHub.repos.listForUser.endpoint(payload)
    )

    for (const repo of repositories) {
        await instance.list(repo.owner.login, repo.name)
    }
}

Issue.prototype.new = function() {
    const instance = this
    const options = instance.options
    let body

    if (options.message) {
        body = logger.applyReplacements(options.message, config.replace)
    }

    if (options.labels) {
        options.labels = options.labels.split(',')
    } else {
        options.labels = []
    }

    const payload = {
        body,
        assignee: options.assignee,
        repo: options.repo,
        title: options.title,
        owner: options.user,
        labels: options.labels,
    }

    return instance.GitHub.issues.create(payload)
}

Issue.prototype.open = async function(number) {
    const instance = this

    const issue = await instance.getIssue_(number)

    return instance.editIssue_(issue.title, Issue.STATE_OPEN, number)
}

Issue.prototype.search = async function(user, repo) {
    const instance = this
    const options = instance.options
    let query = ['type:issue']
    let payload

    if (!options.all && repo) {
        query.push(`repo:${repo}`)
    }

    if (user) {
        query.push(`user:${user}`)
    }

    query.push(options.search)

    payload = {
        q: query.join(' '),
    }

    const { data } = await instance.GitHub.search.issuesAndPullRequests(payload)

    if (data.items && data.items.length > 0) {
        const formattedIssues = formatIssues(data.items, options.detailed)

        logger.log(formattedIssues)
    } else {
        logger.log('Could not find any issues matching your query.')
    }
}

async function closeHandler(instance, options) {
    options.state = Issue.STATE_CLOSED

    for (const number of options.number) {
        logger.log(`Closing issue ${number} on ${getUserRepo(options)}`)

        try {
            var { data } = await instance.close(number)
        } catch (err) {
            throw new Error(`Can't close issue.\n${err}`)
        }

        logger.log(logger.colors.cyan(data.html_url))
    }
}

async function openHandler(instance, options) {
    for (const number of options.number) {
        logger.log(`Opening issue ${number} on ${getUserRepo(options)}`)

        try {
            var { data } = await instance.open(number)
        } catch (err) {
            throw new Error(`Can't close issue.\n${err}`)
        }

        logger.log(logger.colors.cyan(data.html_url))
    }
}

function formatIssues(issues, showDetailed, dateFormatter?: string) {
    issues.sort((a, b) => {
        return a.number > b.number ? -1 : 1
    })

    if (issues && issues.length > 0) {
        const formattedIssuesArr = issues.map(issue => {
            const issueNumber = logger.colors.green(`#${issue.number}`)
            const issueUser = logger.colors.magenta(`@${issue.user.login}`)
            const issueDate = `(${logger.getDuration(issue.created_at, dateFormatter)})`

            let formattedIssue = `${issueNumber} ${issue.title} ${issueUser} ${issueDate}`

            if (showDetailed) {
                if (issue.body) {
                    formattedIssue = `
                        ${formattedIssue}
                        ${issue.body}
                    `
                }

                if (isArray(issue.labels) && issue.labels.length > 0) {
                    const labels = issue.labels.map(label => label.name)
                    const labelHeading = labels.length > 1 ? 'labels: ' : 'label: '

                    formattedIssue = `
                        ${formattedIssue}
                        ${logger.colors.yellow(labelHeading) + labels.join(', ')}
                    `
                }

                if (issue.milestone) {
                    const { number, title } = issue.milestone

                    formattedIssue = `
                        ${formattedIssue}
                        ${`${logger.colors.green('milestone: ')} ${title} - ${number}`}
                    `
                }

                formattedIssue = `
                    ${formattedIssue}
                    ${logger.colors.blue(issue.html_url)}
                `
            }

            return trim(formattedIssue)
        })

        return formattedIssuesArr.join('\n\n')
    }

    return null
}

function trim(str) {
    return str
        .replace(/^[ ]+/gm, '')
        .replace(/[\r\n]+/g, '\n')
        .trim()
}

function getUserRepo(options) {
    return logger.colors.green(`${options.user}/${options.repo}`)
}
