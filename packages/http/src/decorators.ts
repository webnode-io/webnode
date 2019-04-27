import {Node} from '@webnode/cdi'
import {AutoMethod, AutoMethodProperties, ParameterPoint} from './automethod'
import {Route} from './route'
import {Registry} from './registry'
import {Event} from './event'
import {HttpMethod, RePathname, RePathnameParams} from './request'
import {HttpStatus} from './response'

export function Controller(node: Node): Node {
  Registry.instance.registerRouteNode(node)
  return node
}

export function RequestLifecycle(node: Node): Node {
  Registry.instance.registerEventNode(node)
  return node
}

export function RequestMapping(method: HttpMethod, rePathname: RePathname): MethodDecorator {
  return function (target: Object, propertyKey: PropertyKey, descriptor: PropertyDescriptor) {
    Registry.instance.registerRoute(target.constructor as Node, descriptor.value, method, rePathname)
  }
}

export function Middleware(middleware: AutoMethod): MethodDecorator {
  return function (target: Object, propertyKey: PropertyKey, descriptor: PropertyDescriptor) {
    Registry.instance.registerMiddleware(target.constructor as Node, middleware)
  }
}

export function ParameterMapping(point: ParameterPoint): ParameterDecorator {
  return function (target: Object, propertyKey: PropertyKey, parameterIndex: number) {
    Registry.instance.registerParameter(
      target.constructor as Node, 
      Reflect.get(target, propertyKey), 
      parameterIndex, 
      point)
  }
}

export function createMiddleware(middleware: AutoMethod): MethodDecorator {
  return function (target: Object, propertyKey: PropertyKey, descriptor: PropertyDescriptor) {
    Registry.instance.registerMiddleware(target.constructor as Node, middleware)
  }
}

export function ResStatus(status: HttpStatus): MethodDecorator {
  return function (target: Object, propertyKey: string, descriptor: PropertyDescriptor) {
    Registry.instance.registerResponseStatus(target.constructor as Node, descriptor.value, status)
  }
}

export function RequestStart(target: Object, propertyKey: PropertyKey, descriptor: PropertyDescriptor) {
  Registry.instance.registerEvent(target.constructor as Node, descriptor.value, Event.REQUEST_START)
}

export function RequestEnd(target: Object, propertyKey: PropertyKey, descriptor: PropertyDescriptor) {
  Registry.instance.registerEvent(target.constructor as Node, descriptor.value, Event.REQUEST_END)
}

export function RequestError(target: Object, propertyKey: PropertyKey, descriptor: PropertyDescriptor) {
  Registry.instance.registerEvent(target.constructor as Node, descriptor.value, Event.REQUEST_ERROR)
}

export function Get(requestRePathname: string): MethodDecorator {
  return RequestMapping('GET', requestRePathname)
}

export function Post(requestRePathname: string): MethodDecorator {
  return RequestMapping('POST', requestRePathname)
}

export function Put(requestRePathname: string): MethodDecorator {
  return RequestMapping('PUT', requestRePathname)
}

export function Delete(requestRePathname: string): MethodDecorator {
  return RequestMapping('DELETE', requestRePathname)
}

export function Head(requestRePathname: string): MethodDecorator {
  return RequestMapping('HEAD', requestRePathname)
}

export function Trace(requestRePathname: string): MethodDecorator {
  return RequestMapping('TRACE', requestRePathname)
}

export function Options(requestRePathname: string): MethodDecorator {
  return RequestMapping('OPTIONS', requestRePathname)
}

export function Connect(requestRePathname: string): MethodDecorator {
  return RequestMapping('CONNECT', requestRePathname)
}

export function Patch(requestRePathname: string): MethodDecorator {
  return RequestMapping('PATCH', requestRePathname)
}

export function Req(): ParameterDecorator {
  return ParameterMapping(ParameterPoint.REQUEST)
}

export function Res(): ParameterDecorator {
  return ParameterMapping(ParameterPoint.RESPONSE)
}

export function Uri(): ParameterDecorator {
  return ParameterMapping(ParameterPoint.REQUEST_URI)
}

export function Headers(): ParameterDecorator {
  return ParameterMapping(ParameterPoint.REQUEST_HEADERS)
}

export function Params(): ParameterDecorator {
  return ParameterMapping(ParameterPoint.REQUEST_PARAMS)
}

export function Query(): ParameterDecorator {
  return ParameterMapping(ParameterPoint.REQUEST_QUERY)
}

export function ReqBody(): ParameterDecorator {
  return ParameterMapping(ParameterPoint.REQUEST_BODY)
}