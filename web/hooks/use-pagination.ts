import { useEffect, useReducer } from 'react'

type ItemFactory<T> = (limit: number, after?: T) => PromiseLike<T[]>

interface PageState<T> {
  allItems: T[]
  pageItems: T[]
  pageStart: number
  pageEnd: number
}

interface State<T> extends PageState<T> {
  q: ItemFactory<T>
  pageSize: number
  isLoading: boolean
  isComplete: boolean
}

type ActionBase<K, V = void> = V extends void ? { type: K } : { type: K } & V

type Action<T> =
  | ActionBase<'INIT', { opts: PaginationOptions<T> }>
  | ActionBase<'PREPEND', { items: T[] }>
  | ActionBase<'LOAD', { oldItems: T[]; newItems: T[] }>
  | ActionBase<'PREV'>
  | ActionBase<'NEXT'>

function getPageState<T>(allItems: T[], pageStart: number, pageEnd: number) {
  const pageItems = allItems.slice(pageStart, pageEnd)
  return { allItems, pageItems, pageStart, pageEnd }
}

function getReducer<T>() {
  return (state: State<T>, action: Action<T>): State<T> => {
    switch (action.type) {
      case 'INIT': {
        return getInitialState(action.opts)
      }
      case 'PREPEND': {
        const allItems = [...action.items, ...state.allItems]
        const pageState = getPageState(allItems, state.pageStart, state.pageEnd)
        return { ...state, ...pageState }
      }
      case 'LOAD': {
        console.log('Dispatched load:', state, action)
        const allItems = action.oldItems.concat(action.newItems)
        const isComplete = action.newItems.length < state.pageSize
        const pageState = getPageState(allItems, state.pageStart, state.pageEnd)
        return { ...state, ...pageState, isComplete, isLoading: false }
      }
      case 'PREV': {
        const { allItems, pageStart, pageSize } = state
        const prevStart = pageStart - pageSize
        const pageState = getPageState(allItems, prevStart, pageStart)
        return { ...state, ...pageState, isLoading: false }
      }
      case 'NEXT': {
        const { allItems, pageEnd, isComplete, pageSize } = state
        const nextEnd = pageEnd + pageSize
        const isLoading = !isComplete && allItems.length < nextEnd
        const pageState = getPageState(allItems, pageEnd, nextEnd)
        return { ...state, ...pageState, isLoading }
      }
      default:
        throw new Error('Invalid action.')
    }
  }
}

export type PaginationOptions<T> = {
  q: ItemFactory<T>
  pageSize: number
  preload?: T[]
}

function getInitialState<T>(opts: PaginationOptions<T>): State<T> {
  const { q, pageSize, preload } = opts
  const allItems = preload ?? []
  const pageState = getPageState(allItems, 0, pageSize)
  const isLoading = allItems.length < pageSize
  return { ...pageState, q, pageSize, isLoading, isComplete: false }
}

export function usePagination<T>(opts: PaginationOptions<T>) {
  const [state, dispatch] = useReducer(getReducer<T>(), opts, getInitialState)

  useEffect(() => {
    // save callers the effort of ref-izing their opts by checking for
    // deep equality over here. don't care about preload
    if (opts.q === state.q && opts.pageSize === state.pageSize) {
      return
    }
    dispatch({ type: 'INIT', opts })
  }, [opts, state.q, state.pageSize])

  useEffect(() => {
    console.log('Running useEffect: ', state)
    if (state.isLoading) {
      const after = state.allItems[state.allItems.length - 1]
      console.log('Dispatching load: ', state)
      state.q(state.pageSize, after).then((newItems) => {
        dispatch({ type: 'LOAD', oldItems: state.allItems, newItems })
      })
    }
  }, [state.isLoading, state.q, state.allItems, state.pageSize])

  return {
    isLoading: state.isLoading,
    isStart: state.pageStart === 0,
    isEnd: state.isComplete && state.pageEnd >= state.allItems.length,
    getPrev: () => dispatch({ type: 'PREV' }),
    getNext: () => dispatch({ type: 'NEXT' }),
    allItems: state.allItems,
    pageItems: state.pageItems,
    prepend: (...items: T[]) => dispatch({ type: 'PREPEND', items }),
  }
}
