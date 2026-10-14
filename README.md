# @saco/xlsx-plugin

从本地目录或 Git 仓库拉取一份 xlsx，再读成 [ExcelJS](https://github.com/exceljs/exceljs) 的 Workbook。

发布在 npm 官方源：<https://registry.npmjs.org/>。包名 `@saco/xlsx-plugin`。

## 安装

Node.js `>=20`。只提供 ESM，用 `import`。

```bash
npm install @saco/xlsx-plugin
```

```bash
pnpm add @saco/xlsx-plugin
```

从 Git 拉取时，本机命令行里要能运行 `git`。

## 拉取

### `pullFile(options, repoRoot?)`

拉一个或多个文件。`options` 是一个对象，或对象数组。数组按顺序逐个拉，某一项失败则停在该项，前面已落盘的文件保留。

`local` 从本地目录拷贝，`git` 按分支稀疏克隆，只取该文件所在目录。`repoRoot` 默认 `process.cwd()`，数组里每一项的相对 `local` 都用这一个根解析。

```ts
import { pullFile } from '@saco/xlsx-plugin'

pullFile({
	local: '../sheets',
	repoFile: 'docs/table.xlsx',
	destPath: 'data/table.xlsx',
})

pullFile([
	{
		local: '../sheets',
		repoFile: 'docs/table.xlsx',
		destPath: 'data/table.xlsx',
	},
	{
		https: 'https://github.com/org/sheets.git',
		branch: 'main',
		repoFile: 'docs/other.xlsx',
		destPath: 'data/other.xlsx',
	},
])
```

`local` 怎么解析：

| 写法 | 实际目录 |
| --- | --- |
| 绝对路径，或带盘符（`D:/sheets`） | 原样使用 |
| 以 `.` 开头（`../sheets`、`./vendor`） | 相对 `repoRoot` |
| 其它（`sheets`） | 相对 `repoRoot` 的上一级，用来指同级目录 |

`destPath` 是落盘路径。相对路径相对进程当前目录，父目录不存在会创建。源文件不存在时抛出 `[pull] 找不到文件`。

`git` 使用 `git clone --depth 1 --filter=blob:none --sparse`，再 `sparse-checkout` 该文件所在目录。临时目录在系统临时文件夹，前缀 `xlsx-plugin-`，结束后删除。克隆失败抛出 `[pull] git … 失败`。

## 读取

### `readXlsxWorkbook(filePath)`

读取本地 xlsx，返回 ExcelJS `Workbook`。

WPS 或部分在线表格会给 SpreadsheetML 节点加上 `x:` 前缀。ExcelJS 只认无前缀的节点名，直接读取会没有 sheet。这里会先去掉该命名空间前缀再加载。没有前缀的文件按原内容读取。

```ts
import { readXlsxWorkbook, rowToArray } from '@saco/xlsx-plugin'

const workbook = await readXlsxWorkbook('data/table.xlsx')
workbook.eachSheet((sheet) => {
	sheet.eachRow((row, rowNumber) => {
		const cells = rowToArray(row)
		console.log(rowNumber, cells)
	})
})
```

### `rowToArray(row, trim?)`

把一行转成字符串数组。下标 `0` 是最左边的真实列。

ExcelJS 的 `row.values` 用列号当下标，下标 `0` 是空占位，不是表格里的一列。这里会去掉这个占位。中间的空单元格保留为空字符串 `''`。要忽略哪一列、表头在哪一行，由调用方决定。

`trim` 默认 `false`。为 `true` 时每个单元格再 `trim()`。

### `cellToText(value, trim?)`

把一个 ExcelJS 单元格值转成字符串。`trim` 默认 `false`。

| 单元格 | 结果 |
| --- | --- |
| 空 | `''` |
| 字符串、数字、布尔 | `String(value)` |
| 日期 | `toISOString()` |
| 富文本 | 各段 `text` 拼接 |
| 公式 | 用计算结果；没有结果则为 `''` |
| 带 `text` 的对象（例如超链接） | 该 `text` |

## 导出

```ts
import {
	pullFile,
	readXlsxWorkbook,
	rowToArray,
	cellToText,
} from '@saco/xlsx-plugin'

import type {
	PullLocalOptions,
	PullGitOptions,
	PullOptions,
} from '@saco/xlsx-plugin'
```

`PullOptions` 是 `PullLocalOptions | PullGitOptions`。`pullFile` 的第一参也接受 `PullOptions[]`。带 `local` 时写 `repoFile`、`destPath`，不写 `https` / `branch`。走 Git 时写 `https`、`branch`、`repoFile`、`destPath`，不写 `local`。
