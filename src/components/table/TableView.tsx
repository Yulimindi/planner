import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowDown, ArrowUp, ArrowUpDown, Filter as FilterIcon, GripVertical, ImagePlus, LayoutGrid, List, Maximize2, Plus,
  Search, Settings2, Table2, Trash2, X,
} from 'lucide-react'
import { db } from '../../db/db'
import { addRow, deleteImage, deleteRow, reorderColumns, reorderRows, setCategoryView, updateCell } from '../../db/repo'
import { COLUMN_TYPE_LABEL, type Category, type CellValue, type Column, type Row, type ViewMode } from '../../db/types'
import { useDragSort, useSettings } from '../../lib/hooks'
import { useCanEdit } from '../share/ShareModal'
import { cn, moveItem, uid } from '../../lib/utils'
import { Button, EmptyState, IconButton, Input, Label, Modal, Segmented, Select, Spinner } from '../ui'
import { useFeedback } from '../ui/Feedback'
import { StoredImage, useImagePicker } from '../memo/MemoParts'
import { CellDisplay, CellInput, aggregate, cellToText, compareCells } from './cells'
import { ColumnModal } from './ColumnModal'
import { OPS_BY_TYPE, matchFilter, type Filter } from './filters'

interface Sort {
  columnId: string
  dir: 'asc' | 'desc'
}

export function TableView({ category }: { category: Category }) {
  const { confirm, run } = useFeedback()
  const [params, setParams] = useSearchParams()
  const columns = useLiveQuery(() => db.columns.where('categoryId').equals(category.id).sortBy('order'), [category.id])
  const rows = useLiveQuery(() => db.rows.where('categoryId').equals(category.id).sortBy('order'), [category.id])

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort | null>(null)
  const [filters, setFilters] = useState<Filter[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [colModal, setColModal] = useState<{ open: boolean; column?: Column }>({ open: false })
  const [openRowId, setOpenRowId] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const settings = useSettings()
  const canEdit = useCanEdit()
  const view: ViewMode = settings.viewModes[category.id] ?? 'table'

  // 검색 결과에서 넘어온 행 강조
  useEffect(() => {
    const rowId = params.get('row')
    if (!rowId || !rows) return
    setHighlight(rowId)
    setTimeout(() => document.getElementById(`row-${rowId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
    const t = setTimeout(() => setHighlight(null), 2400)
    params.delete('row')
    setParams(params, { replace: true })
    return () => clearTimeout(t)
  }, [params, rows, setParams])

  const processed = useMemo(() => {
    if (!rows || !columns) return []
    const colMap = new Map(columns.map((c) => [c.id, c]))
    const s = search.trim().toLowerCase()
    let list = rows.filter((r) => {
      if (s && !columns.some((c) => cellToText(r.cells[c.id], c).toLowerCase().includes(s))) return false
      return filters.every((f) => {
        const c = colMap.get(f.columnId)
        return !c || matchFilter(r.cells[c.id], c, f)
      })
    })
    const sc = sort && colMap.get(sort.columnId)
    if (sc) {
      list = [...list].sort((a, b) => {
        const r = compareCells(a.cells[sc.id], b.cells[sc.id], sc)
        return sort.dir === 'asc' ? r : -r
      })
    }
    return list
  }, [rows, columns, search, filters, sort])

  if (!columns || !rows) return <Spinner />

  const activeFilters = filters.filter((f) => {
    const c = columns.find((x) => x.id === f.columnId)
    const def = c && OPS_BY_TYPE[c.type].find((o) => o.op === f.op)
    return def && (!def.needsValue || f.value.trim() !== '')
  }).length
  const reorderable = !sort && !search.trim() && activeFilters === 0
  const openRow = rows.find((r) => r.id === openRowId)

  const newRow = async (open = false) => {
    const id = await run(() => addRow(category.id))
    if (id && open) setOpenRowId(id)
    if (id && !open) setTimeout(() => document.getElementById(`row-${id}`)?.scrollIntoView({ block: 'nearest' }), 80)
  }

  const removeRow = async (row: Row) => {
    const ok = await confirm({ title: '이 행을 삭제할까요?', message: '삭제한 행은 되돌릴 수 없어요.', confirmText: '삭제', danger: true })
    if (!ok) return false
    await run(() => deleteRow(row, columns), '행을 삭제했어요.')
    return true
  }

  const cycleSort = (colId: string) => {
    if (!sort || sort.columnId !== colId) setSort({ columnId: colId, dir: 'asc' })
    else if (sort.dir === 'asc') setSort({ columnId: colId, dir: 'desc' })
    else setSort(null)
  }

  return (
    <div>
      {/* toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented<ViewMode>
          value={view}
          onChange={(v) => run(() => setCategoryView(category.id, v))}
          options={[
            { value: 'table', label: 'Table', icon: <Table2 size={15} /> },
            { value: 'list', label: 'List', icon: <List size={15} /> },
            { value: 'gallery', label: 'Gallery', icon: <LayoutGrid size={15} /> },
          ]}
        />
        <div className="relative min-w-40 flex-1 sm:max-w-64">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="표에서 검색" className="field-pill h-10 pl-10" />
        </div>
        <Button size="sm" className="h-9" variant={showFilters || activeFilters ? 'secondary' : 'ghost'} icon={<FilterIcon size={15} />} onClick={() => setShowFilters((v) => !v)}>
          필터{activeFilters ? ` ${activeFilters}` : ''}
        </Button>
        <div className="flex items-center gap-1">
          <Select
            aria-label="정렬 기준"
            value={sort?.columnId ?? ''}
            onChange={(e) => setSort(e.target.value ? { columnId: e.target.value, dir: sort?.dir ?? 'asc' } : null)}
            className="h-9 w-auto min-w-28 text-[13px]"
          >
            <option value="">정렬 없음</option>
            {columns.filter((c) => c.type !== 'image').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {sort && (
            <IconButton label={sort.dir === 'asc' ? '오름차순' : '내림차순'} onClick={() => setSort({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}>
              {sort.dir === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
            </IconButton>
          )}
        </div>
        {canEdit && (
          <div className="ml-auto flex gap-2">
            <Button size="sm" className="h-9" icon={<Settings2 size={15} />} onClick={() => setColModal({ open: true })}>열 추가</Button>
            <Button size="sm" className="h-9" variant="primary" icon={<Plus size={15} />} onClick={() => newRow(view !== 'table')}>행 추가</Button>
          </div>
        )}
      </div>

      {showFilters && <FilterPanel columns={columns} filters={filters} onChange={setFilters} />}

      {rows.length === 0 ? (
        <EmptyState
          icon={<Table2 size={22} />}
          title="아직 데이터가 없어요"
          description="‘행 추가’로 첫 번째 항목을 입력해 보세요. 열은 ‘열 추가’나 열 이름을 눌러 설정할 수 있어요."
          action={canEdit ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => newRow(view !== 'table')}>행 추가</Button> : undefined}
        />
      ) : processed.length === 0 ? (
        <EmptyState icon={<Search size={22} />} title="조건에 맞는 행이 없어요" description="검색어나 필터를 바꿔보세요." />
      ) : view === 'table' ? (
        <fieldset disabled={!canEdit} className="min-w-0">
        <TableGrid
          columns={columns}
          rows={processed}
          allRows={rows}
          sort={sort}
          onSort={cycleSort}
          reorderable={reorderable && canEdit}
          highlight={highlight}
          onColumn={(c) => setColModal({ open: true, column: c })}
          onOpenRow={setOpenRowId}
          onDeleteRow={removeRow}
          canEdit={canEdit}
        />
        </fieldset>
      ) : view === 'list' ? (
        <ListRows columns={columns} rows={processed} highlight={highlight} onOpen={setOpenRowId} canEdit={canEdit} />
      ) : (
        <GalleryRows columns={columns} rows={processed} highlight={highlight} onOpen={setOpenRowId} />
      )}

      {rows.length > 0 && (
        <p className="mt-2 text-[12px] text-muted">
          {processed.length === rows.length ? `${rows.length}개 행` : `${rows.length}개 중 ${processed.length}개 표시`}
          {view === 'table' && !reorderable && ' · 정렬/검색/필터 중에는 행 순서를 바꿀 수 없어요'}
        </p>
      )}

      <ColumnModal
        open={colModal.open}
        column={colModal.column}
        columns={columns}
        categoryId={category.id}
        onClose={() => setColModal({ open: false })}
      />
      <RowModal
        row={openRow}
        columns={columns}
        rows={rows}
        canEdit={canEdit}
        onClose={() => setOpenRowId(null)}
        onDelete={async (r) => { if (await removeRow(r)) setOpenRowId(null) }}
      />
    </div>
  )
}

/* ── 필터 패널 ───────────────────────────────────────────── */
function FilterPanel({ columns, filters, onChange }: { columns: Column[]; filters: Filter[]; onChange: (f: Filter[]) => void }) {
  const add = () => {
    const c = columns[0]
    onChange([...filters, { id: uid(), columnId: c.id, op: OPS_BY_TYPE[c.type][0].op, value: '' }])
  }
  const patch = (id: string, p: Partial<Filter>) => onChange(filters.map((f) => (f.id === id ? { ...f, ...p } : f)))
  return (
    <div className="card mb-3 space-y-2 p-3">
      {filters.length === 0 && <p className="px-1 text-[13px] text-muted">조건을 추가하면 모든 조건을 만족하는 행만 표시돼요.</p>}
      {filters.map((f) => {
        const col = columns.find((c) => c.id === f.columnId) ?? columns[0]
        const ops = OPS_BY_TYPE[col.type]
        const def = ops.find((o) => o.op === f.op) ?? ops[0]
        return (
          <div key={f.id} className="flex flex-wrap items-center gap-2">
            <Select
              value={col.id}
              onChange={(e) => {
                const c = columns.find((x) => x.id === e.target.value)!
                patch(f.id, { columnId: c.id, op: OPS_BY_TYPE[c.type][0].op, value: '' })
              }}
              className="h-9 w-36 text-[13px]"
            >
              {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={def.op} onChange={(e) => patch(f.id, { op: e.target.value as Filter['op'] })} className="h-9 w-36 text-[13px]">
              {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
            </Select>
            {def.needsValue &&
              (col.type === 'select' ? (
                <Select value={f.value} onChange={(e) => patch(f.id, { value: e.target.value })} className="h-9 w-40 text-[13px]">
                  <option value="">선택…</option>
                  {col.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </Select>
              ) : (
                <Input
                  type={col.type === 'date' ? 'date' : col.type === 'number' ? 'number' : 'text'}
                  value={f.value}
                  onChange={(e) => patch(f.id, { value: e.target.value })}
                  className="h-9 w-40 text-[13px]"
                  placeholder="값"
                />
              ))}
            <IconButton label="조건 삭제" onClick={() => onChange(filters.filter((x) => x.id !== f.id))}><X size={15} /></IconButton>
          </div>
        )
      })}
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={add}>조건 추가</Button>
        {filters.length > 0 && <Button size="sm" variant="ghost" onClick={() => onChange([])}>모두 지우기</Button>}
      </div>
    </div>
  )
}

/* ── Table View ─────────────────────────────────────────── */
function TableGrid({
  columns, rows, allRows, sort, onSort, reorderable, highlight, onColumn, onOpenRow, onDeleteRow, canEdit,
}: {
  columns: Column[]
  rows: Row[]
  allRows: Row[]
  sort: Sort | null
  onSort: (colId: string) => void
  reorderable: boolean
  highlight: string | null
  onColumn: (c: Column) => void
  onOpenRow: (id: string) => void
  onDeleteRow: (r: Row) => void
  canEdit: boolean
}) {
  const { run } = useFeedback()
  const [editing, setEditing] = useState<{ rowId: string; colId: string } | null>(null)
  const rowDrag = useDragSort(allRows.map((r) => r.id), (ids) => run(() => reorderRows(ids)))
  const colDrag = useDragSort(columns.map((c) => c.id), (ids) => run(() => reorderColumns(ids)))
  const hasAgg = columns.some((c) => c.aggregate !== 'none')

  const commit = (row: Row, col: Column, v: CellValue) => run(() => updateCell(row, col.id, v))

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-line bg-side/60 text-left">
            <th className="w-8" />
            {columns.map((c) => (
              <th
                key={c.id}
                {...(canEdit ? colDrag.itemProps(c.id) : {})}
                className={cn(
                  'group min-w-36 border-l border-line px-1 py-1 font-medium text-muted first:border-l-0',
                  c.type === 'checkbox' && 'min-w-20',
                  c.type === 'number' && 'min-w-28',
                  colDrag.overId === c.id && colDrag.dragId !== c.id && 'bg-accent-soft/50',
                  colDrag.dragId === c.id && 'opacity-40',
                )}
              >
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => onColumn(c)}
                    className="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-[13px] hover:bg-hover hover:text-ink"
                    title={`${c.name} · ${COLUMN_TYPE_LABEL[c.type]} (눌러서 설정, 드래그해서 이동)`}
                  >
                    {c.name}
                  </button>
                  {c.type !== 'image' && (
                    <IconButton label="정렬" className="size-6 opacity-60 group-hover:opacity-100" onClick={() => onSort(c.id)}>
                      {sort?.columnId === c.id ? (sort.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ArrowUpDown size={13} />}
                    </IconButton>
                  )}
                </div>
              </th>
            ))}
            <th className="w-20" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const drag = reorderable ? rowDrag.itemProps(r.id) : {}
            return (
              <tr
                key={r.id}
                id={`row-${r.id}`}
                {...drag}
                draggable={reorderable && !editing}
                className={cn(
                  'group border-b border-line last:border-b-0 transition-colors hover:bg-hover/40',
                  highlight === r.id && 'bg-accent-soft/70',
                  rowDrag.dragId === r.id && 'opacity-40',
                  rowDrag.overId === r.id && rowDrag.dragId !== r.id && 'bg-accent-soft/40',
                )}
              >
                <td className="w-8 pl-1 text-center align-middle">
                  <GripVertical size={14} className={cn('mx-auto text-muted/0 transition', reorderable && 'cursor-grab group-hover:text-muted/60')} />
                </td>
                {columns.map((c) => {
                  const v = r.cells[c.id]
                  const isEditing = editing?.rowId === r.id && editing.colId === c.id
                  return (
                    <td key={c.id} className="h-[52px] max-w-80 border-l border-line px-1 align-middle text-[14.5px] first:border-l-0">
                      {c.type === 'checkbox' ? (
                        <div className="flex justify-center">
                          <input type="checkbox" checked={v === true} onChange={(e) => commit(r, c, e.target.checked)} className="size-4 cursor-pointer" aria-label={c.name} />
                        </div>
                      ) : c.type === 'image' ? (
                        <ImageCell value={v} onCommit={(nv) => commit(r, c, nv)} />
                      ) : isEditing ? (
                        <CellInput col={c} value={v} inline autoFocus onCommit={(nv) => commit(r, c, nv)} onDone={() => setEditing(null)} />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditing({ rowId: r.id, colId: c.id })}
                          className={cn(
                            'flex min-h-9 w-full items-center rounded-md px-2 py-1 text-left hover:bg-hover',
                            c.type === 'number' && 'justify-end',
                          )}
                        >
                          <span className="min-w-0 truncate"><CellDisplay col={c} value={v} compact /></span>
                        </button>
                      )}
                    </td>
                  )
                })}
                <td className="w-20 pr-2">
                  <div className="flex justify-end opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                    <IconButton label="펼쳐서 보기" onClick={() => onOpenRow(r.id)}><Maximize2 size={14} /></IconButton>
                    <IconButton label="행 삭제" onClick={() => onDeleteRow(r)} className="hover:text-danger"><Trash2 size={14} /></IconButton>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
        {hasAgg && (
          <tfoot>
            <tr className="border-t border-line bg-side/30 text-[12px] text-muted">
              <td />
              {columns.map((c) => (
                <td key={c.id} className={cn('px-3 py-2 tabular-nums', c.type === 'number' && 'text-right')}>{aggregate(rows, c)}</td>
              ))}
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function ImageCell({ value, onCommit }: { value: CellValue | undefined; onCommit: (v: CellValue) => void }) {
  const id = typeof value === 'string' && value ? value : null
  const picker = useImagePicker((ids) => {
    const [first, ...rest] = ids
    rest.forEach((x) => deleteImage(x))
    if (id) deleteImage(id)
    onCommit(first)
  })
  return (
    <div className="group/img relative flex items-center px-1">
      {picker.input}
      {id ? (
        <>
          <button type="button" onClick={picker.open} title="이미지 변경">
            <StoredImage id={id} className="size-9 rounded-md border border-line" />
          </button>
          <button
            type="button"
            aria-label="이미지 삭제"
            onClick={() => { deleteImage(id); onCommit(null) }}
            className="ml-1 hidden size-5 items-center justify-center rounded-full text-muted group-hover/img:flex hover:bg-hover hover:text-ink"
          >
            <X size={12} />
          </button>
        </>
      ) : (
        <button type="button" onClick={picker.open} className="flex size-9 items-center justify-center rounded-md text-muted/50 hover:bg-hover hover:text-muted" aria-label="이미지 추가">
          <ImagePlus size={15} />
        </button>
      )}
    </div>
  )
}

/* ── List / Gallery View ────────────────────────────────── */
function rowTitle(r: Row, columns: Column[]): { title: string; titleCol?: Column } {
  const titleCol = columns.find((c) => c.type === 'text') ?? columns.find((c) => c.type !== 'image' && c.type !== 'checkbox')
  return { title: (titleCol && cellToText(r.cells[titleCol.id], titleCol)) || '제목 없음', titleCol }
}

function ListRows({ columns, rows, highlight, onOpen, canEdit }: { columns: Column[]; rows: Row[]; highlight: string | null; onOpen: (id: string) => void; canEdit: boolean }) {
  const { run } = useFeedback()
  const imgCol = columns.find((c) => c.type === 'image')
  const checkCol = columns.find((c) => c.type === 'checkbox')
  return (
    <div className="card divide-y divide-line overflow-hidden">
      {rows.map((r) => {
        const { title, titleCol } = rowTitle(r, columns)
        const others = columns.filter((c) => c !== titleCol && c !== imgCol && c !== checkCol)
        return (
          <div key={r.id} id={`row-${r.id}`} className={cn('flex items-center gap-3 px-4 py-3 transition hover:bg-hover/50', highlight === r.id && 'bg-accent-soft/70')}>
            {checkCol && (
              <input
                type="checkbox"
                checked={r.cells[checkCol.id] === true}
                onChange={(e) => run(() => updateCell(r, checkCol.id, e.target.checked))}
                disabled={!canEdit}
                className="size-4 shrink-0 cursor-pointer"
                aria-label={checkCol.name}
              />
            )}
            {imgCol && typeof r.cells[imgCol.id] === 'string' && r.cells[imgCol.id] && (
              <StoredImage id={String(r.cells[imgCol.id])} className="size-10 shrink-0 rounded-lg" />
            )}
            <button type="button" onClick={() => onOpen(r.id)} className="min-w-0 flex-1 text-left">
              <p className={cn('truncate text-[14px] font-medium', checkCol && r.cells[checkCol.id] === true && 'text-muted line-through')}>{title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                {others.map((c) => {
                  const v = r.cells[c.id]
                  if (v === null || v === undefined || v === '') return null
                  return (
                    <span key={c.id} className="inline-flex max-w-60 items-center gap-1 truncate">
                      <span className="text-muted/70">{c.name}</span>
                      <CellDisplay col={c} value={v} compact />
                    </span>
                  )
                })}
              </div>
            </button>
          </div>
        )
      })}
    </div>
  )
}

function GalleryRows({ columns, rows, highlight, onOpen }: { columns: Column[]; rows: Row[]; highlight: string | null; onOpen: (id: string) => void }) {
  const imgCol = columns.find((c) => c.type === 'image')
  return (
    <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3 @3xl:grid-cols-4">
      {rows.map((r) => {
        const { title, titleCol } = rowTitle(r, columns)
        const img = imgCol ? r.cells[imgCol.id] : null
        const others = columns.filter((c) => c !== titleCol && c !== imgCol).slice(0, 3)
        return (
          <button
            key={r.id}
            id={`row-${r.id}`}
            type="button"
            onClick={() => onOpen(r.id)}
            className={cn('card overflow-hidden text-left card-hover', highlight === r.id && 'ring-2 ring-accent/50')}
          >
            {typeof img === 'string' && img ? (
              <StoredImage id={img} className="aspect-[4/3] w-full" />
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center bg-side/50 text-[22px] font-semibold text-muted/40">
                {title.slice(0, 1)}
              </div>
            )}
            <div className="p-3">
              <p className="truncate text-[14px] font-medium">{title}</p>
              <div className="mt-1.5 space-y-1 text-[12px] text-muted">
                {others.map((c) => {
                  const v = r.cells[c.id]
                  if (v === null || v === undefined || v === '' || v === false) return null
                  return (
                    <div key={c.id} className="flex items-center gap-1.5 truncate">
                      <span className="shrink-0 text-muted/70">{c.name}</span>
                      <CellDisplay col={c} value={v} compact />
                    </div>
                  )
                })}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/* ── Row detail modal (모든 보기 방식 공용) ─────────────── */
function RowModal({ row, columns, rows, onClose, onDelete, canEdit }: {
  row: Row | undefined
  columns: Column[]
  rows: Row[]
  canEdit: boolean
  onClose: () => void
  onDelete: (r: Row) => void
}) {
  const { run } = useFeedback()
  if (!row) return <Modal open={false} onClose={onClose}>{null}</Modal>
  const idx = rows.findIndex((r) => r.id === row.id)
  const ids = rows.map((r) => r.id)
  return (
    <Modal
      open
      onClose={onClose}
      title={rowTitle(row, columns).title}
      footer={
        <>
          {canEdit && (
            <>
              <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => onDelete(row)} className="mr-auto">행 삭제</Button>
              <Button size="sm" icon={<ArrowUp size={14} />} disabled={idx <= 0} onClick={() => run(() => reorderRows(moveItem(ids, idx, idx - 1)))}>위로</Button>
              <Button size="sm" icon={<ArrowDown size={14} />} disabled={idx >= rows.length - 1} onClick={() => run(() => reorderRows(moveItem(ids, idx, idx + 1)))}>아래로</Button>
            </>
          )}
          <Button size="sm" variant="primary" onClick={onClose}>완료</Button>
        </>
      }
    >
      <fieldset disabled={!canEdit} className="min-w-0 space-y-4">
        {columns.map((c) => (
          <div key={c.id}>
            <Label hint={COLUMN_TYPE_LABEL[c.type]}>{c.name}</Label>
            <CellInput key={`${row.id}-${c.id}-${c.type}`} col={c} value={row.cells[c.id]} onCommit={(v) => run(() => updateCell(row, c.id, v))} />
          </div>
        ))}
      </fieldset>
    </Modal>
  )
}
