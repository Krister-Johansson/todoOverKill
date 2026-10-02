import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { createFileRoute } from '@tanstack/react-router'

import { env } from '#/env'
import {
  ASSISTANT_DISABLED_MESSAGE,
  ASSISTANT_SYSTEM_PROMPT,
  getAssistantStatus,
} from '#/server/assistant'

type OpenRouterModel = Parameters<typeof createOpenRouterText>[0]

/** The REST error envelope (src/lib/rest.ts) for this route's own errors. */
function errorJson(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status })
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      // The assistant's reply to an AG-UI RunAgentInput, streamed as
      // server-sent events. Text only: no tools until F39.
      POST: async ({ request }) => {
        const apiKey = env.OPENROUTER_API_KEY
        if (!getAssistantStatus().enabled || !apiKey) {
          return errorJson(
            503,
            'assistant_disabled',
            ASSISTANT_DISABLED_MESSAGE,
          )
        }

        let params: Awaited<ReturnType<typeof chatParamsFromRequest>>
        try {
          params = await chatParamsFromRequest(request)
        } catch (error) {
          // A malformed body comes back as a thrown 400 Response.
          if (error instanceof Response) {
            return errorJson(
              400,
              'validation',
              'The request is not a valid chat request.',
            )
          }
          throw error
        }

        // Any OpenRouter model id works; the adapter's union only lists the
        // ones it has metadata for.
        const adapter = createOpenRouterText(
          env.OPENROUTER_MODEL as OpenRouterModel,
          apiKey,
          { appTitle: 'todoOverKill' },
        )
        // Stop in the panel aborts the fetch, which aborts this request; the
        // controller passes that on to the model call and ends the stream.
        const abortController = new AbortController()
        request.signal.addEventListener(
          'abort',
          () => abortController.abort(),
          { once: true },
        )

        const stream = chat({
          adapter,
          messages: params.messages,
          threadId: params.threadId,
          runId: params.runId,
          systemPrompts: [ASSISTANT_SYSTEM_PROMPT],
          abortController,
        })
        return toServerSentEventsResponse(stream, { abortController })
      },
    },
  },
})
