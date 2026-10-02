import { toServerSentEventsResponse } from '@tanstack/ai'
import { createFileRoute } from '@tanstack/react-router'

import { MAX_CHAT_BODY_BYTES } from '#/lib/assistant'
import { isLoopbackHost } from '#/lib/loopback'
import { errorJson, handle, readJsonBody } from '#/lib/rest'
import {
  ASSISTANT_DISABLED_MESSAGE,
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
      // read or the key is used. A body over MAX_CHAT_BODY_BYTES is a 413
      // before it is parsed.
      POST: ({ request }) =>
        handle(async () => {
          if (!isLoopbackHost(request)) {
            return errorJson(403, {
              code: 'forbidden',
              message: 'Only localhost may use this route.',
            })
          }
          const chatRequest = await parseChatRequest(
            await readJsonBody(request, { maxBytes: MAX_CHAT_BODY_BYTES }),
          )

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
