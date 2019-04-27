import {NodeDispatcher} from '@webnode/cdi'
import {IncomingMessage as NativeServerRequest, ServerResponse as NativeServerResponse} from 'http'
import {Readable} from 'stream'
import {UrlWithParsedQuery, parse as parseUrl} from 'url'
import {IncomingForm, File} from "formidable"
import {HttpError, HttpErrorCode} from './error'
import {ServerRequest, HttpMethod} from './request'
import {ServerResponse} from './response'
import {FormConfig} from './config'
import {AutoMethod, AutoMethodProperties, ParameterPoint} from './automethod'
import {Event} from './event'
import {Route} from './route'
import {Registry} from './registry'

function hasContent(headerKey: string, headerContent: string): boolean {
  if (typeof headerKey === 'string' && headerKey.search(headerContent) > -1) {
    return true
  }
  return false
}

function hasFormData(headerKey: string): boolean {
  return hasContent(headerKey, "application/json") ||
         hasContent(headerKey, "multipart/form-data") ||
         hasContent(headerKey, "application/x-www-form-urlencoded")
}

export class RequestExecutor {
  private request: ServerRequest = new ServerRequest()
  private response: ServerResponse = new ServerResponse()
  private route: Route
  private error: Error
  private ended: boolean = false

  constructor(
    private nativeRequest: NativeServerRequest,
    private nativeResponse: NativeServerResponse,
    private nodeDispatcher: NodeDispatcher,
    private registry: Registry,
    private config: FormConfig
  ) {
    let request = this.request as any
    request.uri = parseUrl(decodeURIComponent(nativeRequest.url), true)
    request.method = (request.uri.query.__method ? (request.uri.query.__method as string) : nativeRequest.method).toUpperCase() as HttpMethod
    request.headers = nativeRequest.headers
    request.sessionIdent = (nativeRequest.connection as any).__session__;
    [this.route, request.params] = this.registry.getRoute(request.method, request.uri.pathname)
  }

  private async parseCharSequence() {
    // TODO: buffer?
    return new Promise((complete, fail) => {
      let body = ''
      this.nativeRequest.on('data', (data: string | Buffer) => {
        body += data
      })
      this.nativeRequest.on('error', (error: Error) => {
        fail(HttpError.create(HttpErrorCode.BAD_REQEUST, error.message, error.stack))
      })
      this.nativeRequest.on('end', () => {
        (this.request as any).body = body
        complete()
      })
    })
  }

  private async parseFormData() {
    return new Promise((complete, fail) => {
      let body = Object.create(null)
      this.createIncomingForm()
          .on("error", (error: Error) => {
            fail(HttpError.create(HttpErrorCode.BAD_REQEUST, error.message, error.stack))
          })
          .on("file", (name: string, file: File) => {
            if (!(name in body)) {
              body[name] = []
            }
            body[name].push(file)
          })
          .on("field", (name: string, value: any) => {
            body[name] = value
          })
          .on("end", () => {
            (this.request as any).body = body
            complete()
          })
          .parse(this.nativeRequest)
    })
  }

  private async parseReqBody() {
    if (hasFormData(this.nativeRequest.headers["content-type"] as string)) {
      await this.parseFormData()
    } else {
      await this.parseCharSequence()
    }
  }

  private async prepareContext() {
    (this.request as any).requestIdent = this.nodeDispatcher.createRequestContext(this.request.sessionIdent)

    this.nativeResponse.on('finish', async () => {
      this.ended = true
      for (let autoMethod of this.registry.valuesOfEventAutoMethods(Event.REQUEST_END)) {
        let properties = this.registry.getAutoMethodProperties(autoMethod)
        let node = properties.getNode()
        let args = this.nodeDispatcher.genArgumentsOnRequestLocal(node, autoMethod.name, this.request.sessionIdent, this.request.requestIdent)
        let instance = this.nodeDispatcher.getInstanceOnApplicationLocal(node)
        this.composeArgs(properties, args)
        await Reflect.apply(autoMethod, instance, args) 
      }
      this.nodeDispatcher.destroyRequestContext(this.request.sessionIdent, this.request.requestIdent)
    })

    this.nativeResponse.on('error', (error) => this.error = error)
    this.nativeRequest.on('error', (error) => this.error = error)
    this.nativeRequest.on('close', async () => {
      if (!this.ended) {
        this.ended = true
        for (let autoMethod of this.registry.valuesOfEventAutoMethods(Event.REQUEST_ERROR)) {
          let properties = this.registry.getAutoMethodProperties(autoMethod)
          let node = properties.getNode()
          let args = this.nodeDispatcher.genArgumentsOnRequestLocal(node, autoMethod.name, this.request.sessionIdent, this.request.requestIdent)
          let instance = this.nodeDispatcher.getInstanceOnApplicationLocal(node)
          this.composeArgs(properties, args)
          await Reflect.apply(autoMethod, instance, args) 
        }
        this.nodeDispatcher.destroyRequestContext(this.request.sessionIdent, this.request.requestIdent)
      }
    })

    for (let autoMethod of this.registry.valuesOfEventAutoMethods(Event.REQUEST_START)) {
      let properties = this.registry.getAutoMethodProperties(autoMethod)
      let node = properties.getNode()
      let args = this.nodeDispatcher.genArgumentsOnRequestLocal(node, autoMethod.name, this.request.sessionIdent, this.request.requestIdent)
      let instance = this.nodeDispatcher.getInstanceOnApplicationLocal(node)
      this.composeArgs(properties, args)
      await Reflect.apply(autoMethod, instance, args) 
    }
  }

  private async execRoute() {
    for (let autoMethod of this.route.valuesOfAutoMethods()) {
      let properties = this.registry.getAutoMethodProperties(autoMethod)
      let node = properties.getNode()
      let args = this.nodeDispatcher.genArgumentsOnRequestLocal(node, autoMethod.name, this.request.sessionIdent, this.request.requestIdent)
      let instance = this.nodeDispatcher.getInstanceOnSessionLocal(node, this.request.sessionIdent)
      if (this.registry.hasAutoMethodPayload(autoMethod)) {
        this.response.status = this.registry.getAutoMethodPayload(autoMethod).getResponseStatus()  
      }
      this.composeArgs(properties, args)
      for (let middleware of properties.valuesOfMiddlewares()) {
        await Reflect.apply(middleware, instance, args) 
      }
      await Reflect.apply(autoMethod, instance, args) 
    }
  }

  private send() {
    this.nativeResponse.writeHead(this.response.status, this.response.headers)
    if (this.response.body === undefined || this.response.body === null) {
      this.nativeResponse.end()
    } else if (typeof this.response.body === 'object') {
      if (this.response.body instanceof Buffer) {
        this.nativeResponse.end(this.response.body)
      } else if (this.response.body instanceof Readable) {
        this.response.body.pipe(this.nativeResponse)
      } else {
        this.nativeResponse.end(JSON.stringify(this.response.body))
      }
    } else if (typeof this.response.body === 'string') {
      this.nativeResponse.end(this.response.body)
    } else {
      this.nativeResponse.end(String(this.response.body))
    }
  }

  public async exec() {
    await this.prepareContext()
    try {
      if (this.route === null) {
        this.execHttpError(HttpError.create(HttpErrorCode.NOT_FOUND))
      } else {
        await this.parseReqBody()
        await this.execRoute()
        this.send()
      }
    } catch (err) {
      if (!(err instanceof HttpError)) {
        err = HttpError.create(HttpErrorCode.INTERNAL_SERVER_ERROR, err.message, err.stack)
      }
      this.execHttpError(err)
    }
  }

  private composeArgs(properties: AutoMethodProperties, args: Array<any>) {
    for (let [index, point] of properties.entriesOfParameters()) {
      switch (point) {
      case ParameterPoint.REQUEST:
        args[index] = this.request
        break  
      case ParameterPoint.RESPONSE:
        args[index] = this.response
        break  
      case ParameterPoint.REQUEST_URI:
        args[index] = this.request.uri
        break  
      case ParameterPoint.REQUEST_QUERY:
        args[index] = this.request.uri.query
        break  
      case ParameterPoint.REQUEST_HEADERS:
        args[index] = this.nativeRequest.headers
        break  
      case ParameterPoint.REQUEST_PARAMS:
        args[index] = this.request.params
        break  
      case ParameterPoint.REQUEST_BODY:
        args[index] = this.request.body
        break  
      case ParameterPoint.ERROR:
        args[index] = this.error
        break  
      }
    }
  }

  private async execHttpError(error: HttpError) {
    this.error = error
    this.nativeResponse.writeHead(error.statusCode)
    this.nativeResponse.end(JSON.stringify({
      message: error.message,
      stack: error.stack
    }))
  }

  private createIncomingForm(): IncomingForm {
    return Object.assign(new IncomingForm(), this.config)
  }
}