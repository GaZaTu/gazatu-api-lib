// @deno-types="npm:@types/nodemailer"
import * as mailer from "npm:nodemailer@7.0.5"
import type { Options } from "npm:nodemailer@7.0.5/lib/smtp-transport"

export type SmtpClientConfig = {
  mode: "starttls" | "tls"
  host: string
  port: number
  user: string
  pass: string
  from: string
  cert?: string
}

export const createSmtpClient = (config: SmtpClientConfig | undefined) => {
  if (!config) {
    return undefined
  }

  const connectConfig: Options = {
    host: config.host,
    port: config.port,
    secure: config.mode === "tls",
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      cert: config.cert ? Deno.readTextFileSync(config.cert) : undefined,
    },
  }
  const sendConfigDefaults: Options = {
    from: config.from,
  }

  type SimpleSmtpSendConfig = Pick<Options, "to" | "subject" | "text" | "html">

  const result = {
    send: async (sendConfig: SimpleSmtpSendConfig) => {
      const smtp = mailer.createTransport(connectConfig)
      await smtp.verify()

      try {
        await smtp.sendMail({ ...sendConfigDefaults, ...sendConfig })
      } finally {
        smtp.close()
      }
    },
  }

  return result
}
