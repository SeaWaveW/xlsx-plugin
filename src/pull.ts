import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

interface PullTarget {
	/** 仓库内相对路径，如 docs/table.xlsx */
	repoFile: string
	/** 落到本仓库的路径。相对路径相对进程当前目录 */
	destPath: string
}

/** 本地拷贝。不能带 https / branch */
export interface PullLocalOptions extends PullTarget {
	/**
	 * 本地仓库根。
	 * 绝对路径原样用；以 . 开头相对本仓库根；其余相对本仓库上一级（同级目录）。
	 */
	local: string
}

/** 远程稀疏克隆。不能带 local */
export interface PullGitOptions extends PullTarget {
	/** 远程仓库地址 */
	https: string
	/** 远程分支 */
	branch: string
}

export type PullOptions = PullLocalOptions | PullGitOptions

/** 有盘符或绝对路径原样用；以 . 开头相对仓库根；其余相对仓库上一级 */
const resolveLocalRoot = (repoRoot: string, local: string) => {
	if (path.isAbsolute(local) || /^[A-Za-z]:/.test(local)) {
		return path.resolve(local)
	}
	if (local.startsWith('.')) return path.resolve(repoRoot, local)
	return path.resolve(repoRoot, '..', local)
}

const copyFile = (src: string, destPath: string) => {
	if (!fs.existsSync(src)) {
		throw new Error(`[pull] 找不到文件（${src}）`)
	}
	fs.mkdirSync(path.dirname(destPath), { recursive: true })
	fs.copyFileSync(src, destPath)
	console.log(`[pull] 已替换 ${destPath}`)
}

const runGit = (args: string[], cwd?: string) => {
	const result = spawnSync('git', args, {
		cwd,
		stdio: 'inherit',
		// Windows 上 git 常是 git.cmd，不走 shell 会 ENOENT
		shell: process.platform === 'win32',
	})
	if (result.status !== 0) {
		throw new Error(`[pull] git ${args.join(' ')} 失败`)
	}
}

const pullLocal = (options: PullLocalOptions, repoRoot: string) => {
	const localRoot = resolveLocalRoot(repoRoot, options.local)
	const src = path.join(localRoot, options.repoFile)
	console.log(`[pull] local ${src}`)
	copyFile(src, options.destPath)
}

const pullGit = (options: PullGitOptions) => {
	const repoFile = options.repoFile.replace(/\\/g, '/')
	const dir = path.posix.dirname(repoFile)
	// 稀疏检出目录；文件就在仓库根时检出该文件
	const sparse = dir === '.' ? repoFile : dir
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xlsx-plugin-'))
	try {
		console.log(
			`[pull] clone ${options.https}#${options.branch} (${repoFile})`,
		)
		runGit([
			'clone',
			'--depth',
			'1',
			'--filter=blob:none',
			'--sparse',
			'--branch',
			options.branch,
			options.https,
			tmp,
		])
		runGit(['sparse-checkout', 'set', sparse], tmp)
		copyFile(path.join(tmp, repoFile), options.destPath)
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true })
	}
}

const pullOne = (options: PullOptions, repoRoot: string) => {
	if ('local' in options) {
		pullLocal(options, repoRoot)
		return
	}
	pullGit(options)
}

/**
 * 拉取一个或多个文件。传入数组时按顺序逐个拉，某一项失败则停在该项。
 * local 从本地目录拷；git 按 branch 稀疏克隆远程，只取该文件所在目录。
 * repoRoot 默认 process.cwd()。数组里每一项的相对 local 都用这一个根解析。
 */
export const pullFile = (
	options: PullOptions | readonly PullOptions[],
	repoRoot = process.cwd(),
) => {
	const list = Array.isArray(options) ? options : [options]
	for (const item of list) pullOne(item, repoRoot)
}
