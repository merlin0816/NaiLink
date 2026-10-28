import type { TypedDocumentNode } from '@graphql-typed-document-node/core'
import type { GraphQLClient, RequestDocument, Variables } from 'graphql-request'
import { coreProblemLabel, maintenanceMessages } from './router-maintenance'

export function graphQLNotice(error: { message: string; path?: readonly (string | number)[] }, router: boolean) {
  if (/^latency_job_|^test_job_|^core_changed$|^invalid_test_job$/.test(error.message)) return undefined
  // A statistics request already in flight can lose its core during a switch.
  // Its observer owns the unavailable state; never turn this into a global
  // failure toast. Mutations and other queries still report genuine failures.
  if (router && error.message === 'core_not_ready' && error.path?.join('.') === 'general.runtimeOverview')
    return undefined
  if (router && /^core_[a-z_]+$/.test(error.message))
    return maintenanceMessages[error.message] || coreProblemLabel(error.message)
  return error.message
}

export interface GQLClientInterface {
  request: <T, V extends Variables = Variables>(
    document: RequestDocument | TypedDocumentNode<T, V>,
    variables?: V,
    signal?: AbortSignal,
  ) => Promise<T>
}

// Polling queries consume TanStack's cancellation signal. A hung connection
// also has a deadline covering the response body, not just receipt of headers.
// Mutations keep their existing lifetime when no signal is supplied.
export function cancellableGraphQLClient(client: GraphQLClient, timeoutMs = 30_000): GQLClientInterface {
  return {
    async request<T, V extends Variables = Variables>(
      document: RequestDocument | TypedDocumentNode<T, V>,
      variables?: V,
      signal?: AbortSignal,
    ) {
      const controller = signal ? new AbortController() : undefined
      const abort = () => controller?.abort(signal?.reason)
      if (signal?.aborted) abort()
      signal?.addEventListener('abort', abort, { once: true })
      const timer = controller
        ? setTimeout(() => controller.abort(new DOMException('请求超时，请重试', 'TimeoutError')), timeoutMs)
        : undefined
      try {
        return await client.request<T, Variables>({ document, variables, signal: controller?.signal })
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
    },
  }
}
