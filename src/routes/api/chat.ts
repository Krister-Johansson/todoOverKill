import { toServerSentEventsResponse } from '@tanstack/ai'
import { createFileRoute } from '@tanstack/react-router'

import { isLoopbackHost } from '#/lib/loopback'
import { errorJson, handle, readJsonBody } from '#/lib/rest'
import {
  ASSISTANT_DISABLED_MESSAGE,
  InvalidChatRequestError,
  parseChatRequest,
  startAssistantReply,
} from '#/server/assistant'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      // The assistant's reply to an AG-UI RunAgentInput, streamed as
      // server-sent events. readJsonBody refuses anything but
      // application/json, so another site cannot spend the key through a
      // cross-site text/plain POST. The Host check runs first, so a page
      // that rebinds its domain to 127.0.0.1 is refused before the body is
      // read or the key is used.
      POST: ({ request }) =>
        handle(async () => {
          if (!isLoopbackHost(request)) {
            return errorJson(403, {
              code: 'forbidden',
              message: 'Only localhost may use this route.',
            })
          }
          let chatRequest
          try {
            chatRequest = await parseChatRequest(await readJsonBody(request))
          } catch (error) {
            if (error instanceof InvalidChatRequestError) {
              return errorJson(400, {
                code: error.code,
                message: error.message,
              })
            }
            throw error
          }

          // Stop in the panel aborts the fetch, which aborts this request
          // and, through its signal, the model call.
          const reply = startAssistantReply(chatRequest, request.signal)
          if (!reply) {
            return errorJson(503, {
              code: 'assistant_disabled',
              message: ASSISTANT_DISABLED_MESSAGE,
            })
          }
          return toServerSentEventsResponse(reply.stream, {
            abortController: reply.abortController,
          })
        }),
    },
  },
})
