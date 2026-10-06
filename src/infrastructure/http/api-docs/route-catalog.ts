import { INestApplication, RequestMethod, Type } from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { z, type ZodType } from 'zod';
import type { UserRole } from '../../../domain/entities/user';
import { ALLOW_WHILE_SUSPENDED_KEY } from '../../../interface-adapters/controllers/allow-while-suspended.decorator';
import { IS_PUBLIC_KEY } from '../../../interface-adapters/controllers/public.decorator';
import {
  DEFAULT_ROLES,
  ROLES_KEY,
} from '../../../interface-adapters/controllers/roles.decorator';
import { ZodValidationPipe } from '../../../interface-adapters/controllers/zod-validation.pipe';

export interface CatalogedRoute {
  path: string;
  method: string;
  isPublic: boolean;
  /** US-21: the write still runs while the barbershop is suspended. */
  allowWhileSuspended: boolean;
  roles: readonly UserRole[];
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

interface RouteArgument {
  data?: unknown;
  pipes?: unknown[];
}

type Handler = (...args: unknown[]) => unknown;

// Reads the same metadata the SessionGuard, the SubscriptionAccessGuard and
// the ZodValidationPipe act on,
// so the API docs cannot drift from what a route actually enforces.
export function listRoutes(app: INestApplication): CatalogedRoute[] {
  const reflector = new Reflector();
  const scanner = new MetadataScanner();
  const routes: CatalogedRoute[] = [];

  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as Type | null;
      if (!controller) continue;

      const prototype = controller.prototype as Record<string, Handler>;
      for (const name of scanner.getAllMethodNames(prototype)) {
        const handler = prototype[name];
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as
          RequestMethod | undefined;
        if (method === undefined) continue;

        const targets = [handler, controller];
        routes.push({
          path: openApiPath(
            Reflect.getMetadata(PATH_METADATA, controller) as string,
            Reflect.getMetadata(PATH_METADATA, handler) as string,
          ),
          method: RequestMethod[method].toLowerCase(),
          isPublic:
            reflector.getAllAndOverride<boolean | undefined>(
              IS_PUBLIC_KEY,
              targets,
            ) ?? false,
          allowWhileSuspended:
            reflector.getAllAndOverride<boolean | undefined>(
              ALLOW_WHILE_SUSPENDED_KEY,
              targets,
            ) ?? false,
          roles:
            reflector.getAllAndOverride<UserRole[] | undefined>(
              ROLES_KEY,
              targets,
            ) ?? DEFAULT_ROLES,
          ...validatedInputs(controller, name),
        });
      }
    }
  }

  return routes;
}

function openApiPath(controllerPath: string, handlerPath: string): string {
  const segments = [controllerPath, handlerPath]
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .map((segment) =>
      segment.startsWith(':') ? `{${segment.slice(1)}}` : segment,
    );
  return `/${segments.join('/')}`;
}

function validatedInputs(
  controller: Type,
  methodName: string,
): Pick<CatalogedRoute, 'body' | 'params' | 'query'> {
  const args = (Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    controller,
    methodName,
  ) ?? {}) as Record<string, RouteArgument>;
  const inputs: Pick<CatalogedRoute, 'body' | 'params' | 'query'> = {};

  for (const [key, argument] of Object.entries(args)) {
    const pipe = argument.pipes?.find(
      (candidate): candidate is ZodValidationPipe<unknown> =>
        candidate instanceof ZodValidationPipe,
    );
    if (!pipe) continue;

    // A named argument such as @Param('id', pipe) validates a single value.
    const schema =
      typeof argument.data === 'string'
        ? z.object({ [argument.data]: pipe.schema })
        : pipe.schema;
    const paramtype = Number(key.split(':')[0]);
    if (paramtype === Number(RouteParamtypes.BODY)) inputs.body = schema;
    if (paramtype === Number(RouteParamtypes.PARAM)) inputs.params = schema;
    if (paramtype === Number(RouteParamtypes.QUERY)) inputs.query = schema;
  }

  return inputs;
}
