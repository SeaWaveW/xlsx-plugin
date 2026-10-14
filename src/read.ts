import { createRequire } from 'node:module'
import fs from 'node:fs'
import ExcelJS from 'exceljs'

interface JSZipFile {
	dir: boolean
	async: (type: 'string') => Promise<string>
}

interface JSZipInstance {
	files: Record<string, JSZipFile>
	file: (name: string, data: string) => void
	generateAsync: (opts: {
		type: 'nodebuffer'
		compression: string
	}) => Promise<Buffer>
}

interface JSZipStatic {
	loadAsync: (data: Buffer) => Promise<JSZipInstance>
}

/** exceljs 自带 jszip。从 exceljs 解析，避免 pnpm 严格模式在仓库根找不到 */
const require = createRequire(import.meta.url)
const requireFromExceljs = createRequire(require.resolve('exceljs'))
const JSZip = requireFromExceljs('jszip') as JSZipStatic

const SPREADSHEET_NS =
	'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

/**
 * 去掉 SpreadsheetML 标签上的命名空间前缀（`<x:workbook>` → `<workbook>`）。
 * ExcelJS 只匹配无前缀节点名，漏了会读不到 sheet。
 */
const stripSpreadsheetPrefix = (xml: string) => {
	const escaped = SPREADSHEET_NS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const xmlnsRe = new RegExp(`xmlns:([A-Za-z_][\\w.-]*)=["']${escaped}["']`)
	const matched = xml.match(xmlnsRe)
	if (!matched) return xml
	const prefix = matched[1]
	return xml.replace(new RegExp(`(</?)${prefix}:`, 'g'), '$1')
}

/** 解压 xlsx，只改带前缀的 xml，再打回 buffer 给 ExcelJS.load */
const normalizeSpreadsheetXml = async (raw: Buffer) => {
	const zip = await JSZip.loadAsync(raw)
	let changed = false
	for (const [name, entry] of Object.entries(zip.files)) {
		if (entry.dir || !name.endsWith('.xml')) continue
		const xml = await entry.async('string')
		const next = stripSpreadsheetPrefix(xml)
		if (next === xml) continue
		zip.file(name, next)
		changed = true
	}
	if (!changed) return raw
	return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/** ExcelJS 的 Buffer 是 ArrayBuffer，不是 Node 的 Buffer */
const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
	const copy = new ArrayBuffer(bytes.byteLength)
	new Uint8Array(copy).set(bytes)
	return copy
}

/**
 * 读取 xlsx，返回 ExcelJS Workbook。
 * WPS / 部分在线表格会给节点加 `x:` 前缀，直接 readFile 会没有 sheets。
 */
export const readXlsxWorkbook = async (filePath: string) => {
	const buffer = await normalizeSpreadsheetXml(fs.readFileSync(filePath))
	const workbook = new ExcelJS.Workbook()
	await workbook.xlsx.load(toArrayBuffer(buffer))
	return workbook
}

/** 单元格转纯文本。trim 为 true 时去掉首尾空白，默认保留原文空格 */
export const cellToText = (value: ExcelJS.CellValue, trim = false): string => {
	const text = cellToRaw(value)
	return trim ? text.trim() : text
}

const cellToRaw = (value: ExcelJS.CellValue): string => {
	if (value == null) return ''
	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return String(value)
	}
	if (value instanceof Date) return value.toISOString()
	if (typeof value === 'object') {
		if ('richText' in value && Array.isArray(value.richText)) {
			return value.richText.map((part) => part.text ?? '').join('')
		}
		if ('result' in value && value.result != null) {
			return cellToRaw(value.result as ExcelJS.CellValue)
		}
		if ('text' in value && value.text != null) return String(value.text)
	}
	return ''
}

/**
 * 把一行转成字符串数组。下标 0 是最左列，空列留空字符串，列顺序跟表一致。
 * 不在这里裁列：哪一列是什么，由调用方自己认下标。
 */
export const rowToArray = (row: ExcelJS.Row, trim = false): string[] => {
	const values = row.values
	if (!Array.isArray(values)) return []
	// ExcelJS 用列号当下标，0 号没有格子，不是用户的一列。去掉这个占位，下标才从最左列计
	const columns = (values as ExcelJS.CellValue[]).slice()
	columns.shift()
	return columns.map((cell) => cellToText(cell, trim))
}
