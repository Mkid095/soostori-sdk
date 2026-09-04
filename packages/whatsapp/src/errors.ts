import { SoostoriError } from '@soostori/core'

export class WhatsAppError extends SoostoriError {
  readonly httpStatus?: number
  constructor(message: string, code = 'WHATSAPP_ERROR', httpStatus?: number, cause?: unknown) {
    super(code, message, cause)
    this.name = 'WhatsAppError'
    if (httpStatus !== undefined) this.httpStatus = httpStatus
  }
}
