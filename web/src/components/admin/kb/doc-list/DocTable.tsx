'use client';
// 文档列表表格 —— 基于模板 SearchTableOrders 脚手架改造（搜索/排序/分页保持一致）
// 父页面已改为 Server Component，本组件持有 useState + react-table 交互状态，必须显式声明客户端
import React from 'react';
import NavLink from 'components/link/NavLink';
import Card from 'components/card';
import SearchIcon from 'components/icons/SearchIcon';
import { MdChevronRight, MdChevronLeft } from 'react-icons/md';
import type { KbDocSummary } from 'types/kb';

import {
  PaginationState,
  createColumnHelper,
  useReactTable,
  ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table';

const columnHelper = createColumnHelper<KbDocSummary>();

const headerCell = (text: string) => (
  <p className="text-sm font-bold text-gray-600 dark:text-white">{text}</p>
);

function DocTable(props: { tableData: KbDocSummary[] }) {
  const { tableData } = props;
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [globalFilter, setGlobalFilter] = React.useState('');
  const createPages = (count: number) => {
    let arrPageCount = [];
    for (let i = 1; i <= count; i++) {
      arrPageCount.push(i);
    }
    return arrPageCount;
  };
  const columns = [
    columnHelper.accessor('title', {
      id: 'title',
      header: () => headerCell('文档'),
      cell: (info) => (
        <NavLink
          href={`/admin/kb/${info.row.original.domain}/${info.row.original.slug}`}
          className="font-medium text-navy-700 hover:text-brand-500 dark:text-white dark:hover:text-brand-400"
        >
          {info.getValue()}
          <p className="text-xs font-normal text-gray-600">
            {info.row.original.sourceFile}
          </p>
        </NavLink>
      ),
    }),
    columnHelper.accessor('ingestedAt', {
      id: 'ingestedAt',
      header: () => headerCell('摄取时间'),
      cell: (info) => (
        <p className="text-sm font-bold text-navy-700 dark:text-white">
          {String(info.getValue()).slice(0, 10)}
        </p>
      ),
    }),
    columnHelper.accessor('chunks', {
      id: 'chunks',
      header: () => headerCell('分块'),
      cell: (info) => (
        <p className="text-sm font-bold text-navy-700 dark:text-white">
          {info.getValue()}
        </p>
      ),
    }),
    columnHelper.accessor('termCount', {
      id: 'termCount',
      header: () => headerCell('术语'),
      cell: (info) => (
        <p className="text-sm font-bold text-navy-700 dark:text-white">
          {info.getValue()}
        </p>
      ),
    }),
    columnHelper.accessor('costUsd', {
      id: 'costUsd',
      header: () => headerCell('成本'),
      cell: (info) => (
        <p className="text-sm font-bold text-navy-700 dark:text-white">
          ${Number(info.getValue()).toFixed(4)}
        </p>
      ),
    }),
    columnHelper.accessor('slug', {
      id: 'actions',
      header: () => headerCell('操作'),
      cell: (info) => (
        <NavLink
          href={`/admin/kb/${info.row.original.domain}/${info.getValue()}`}
          className="cursor-pointer font-medium text-brand-500 dark:text-brand-400"
        >
          阅读
        </NavLink>
      ),
    }),
  ];
  const [{ pageIndex, pageSize }, setPagination] =
    React.useState<PaginationState>({
      pageIndex: 0,
      pageSize: 6,
    });

  const pagination = React.useMemo(
    () => ({ pageIndex, pageSize }),
    [pageIndex, pageSize],
  );
  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      columnFilters,
      globalFilter,
      pagination,
    },
    onPaginationChange: setPagination,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <Card extra={'w-full h-full sm:overflow-auto px-6'}>
      <div className="flex w-[400px] max-w-full items-center rounded-xl pt-[20px]">
        <div className="flex h-[38px] w-[400px] flex-grow items-center rounded-xl bg-lightPrimary text-sm text-gray-600 dark:!bg-navy-900 dark:text-white">
          <SearchIcon />
          <input
            value={globalFilter ?? ''}
            onChange={(e: any) => setGlobalFilter(e.target.value)}
            type="text"
            placeholder="搜索文档标题…"
            className="block w-full rounded-full bg-lightPrimary text-base text-navy-700 outline-none dark:!bg-navy-900 dark:text-white"
          />
        </div>
      </div>

      <div className="mt-8 overflow-x-scroll xl:overflow-x-hidden">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="!border-px !border-gray-400">
                {headerGroup.headers.map((header) => {
                  return (
                    <th
                      key={header.id}
                      colSpan={header.colSpan}
                      onClick={header.column.getToggleSortingHandler()}
                      className="cursor-pointer border-b border-gray-200 pb-2 pr-4 pt-4 text-start dark:border-white/30"
                    >
                      <div className="items-center justify-between text-xs text-gray-200">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              return (
                <tr
                  key={row.id}
                  className="border-b border-gray-200 dark:border-white/30"
                >
                  {row.getVisibleCells().map((cell) => {
                    return (
                      <td
                        key={cell.id}
                        className="min-w-[120px] border-white/0 py-3 pr-4"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {/* pagination */}
        <div className="mt-2 flex h-20 w-full items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-700">
              共 {tableData.length} 份文档
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className={`linear flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 p-2 text-lg text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300 dark:active:bg-brand-200`}
            >
              <MdChevronLeft />
            </button>
            {createPages(table.getPageCount()).map((pageNumber, index) => {
              return (
                <button
                  className={`linear flex h-10 w-10 items-center justify-center rounded-full p-2 text-sm transition duration-200 ${
                    pageNumber === pageIndex + 1
                      ? 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300 dark:active:bg-brand-200'
                      : 'border-[1px] border-gray-400 bg-[transparent] dark:border-white dark:text-white'
                  }`}
                  onClick={() => table.setPageIndex(pageNumber - 1)}
                  key={index}
                >
                  {pageNumber}
                </button>
              );
            })}
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className={`linear flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 p-2 text-lg text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:text-white dark:hover:bg-brand-300 dark:active:bg-brand-200`}
            >
              <MdChevronRight />
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default DocTable;
