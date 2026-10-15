# Final review — BonAppetit-v2 (5056c38..02c776e)

Revisión de todo el código tras las 13 tareas. Foco: código muerto, duplicado y lento.
Formato: `<file>:L<línea>: <tipo>: <problema>. <acción>.`

## Verificación ejecutada

| check                                                                 | resultado                         |
| --------------------------------------------------------------------- | --------------------------------- |
| `npm run lint` (prettier --check)                                     | limpio                            |
| `npm test`                                                            | shared 11 + api 49 + web 25 pasan |
| `tsc --noUnusedLocals --noUnusedParameters` (api, shared, web)        | 1 hallazgo: `recipe-form.ts:20`   |
| `ng build`                                                            | initial 388.58 kB < budget 500 kB |
| `EXPLAIN (ANALYZE)` en bonappetit (6 recetas, 4 listas, 5 membresías) | ver hallazgos 7 y 17/18           |

Ninguno de los 18 hallazgos es bloqueante. Los más rápidos de arreglar: `Validators`,
`PhotoStorage` y el `describe` duplicado en `login.spec.ts`.

## muerto

```
apps/web/src/app/recipes/recipe-form/recipe-form.ts:20: muerto: import Validators sin uso (tsc --noUnusedLocals → TS6133). Borrar.
apps/api/src/app.ts:11: muerto: export type { PhotoStorage } sin importadores (grep: se importa de storage.ts, nunca de app.js). Borrar.
packages/shared/src/schemas.ts:99: muerto: type ApiError sin ninguna referencia en apps/packages. Borrar.
packages/shared/src/schemas.ts:9: muerto: type Email sin ninguna referencia. Borrar.
packages/shared/src/schemas.ts:78: muerto: type ListInput sin ninguna referencia. Borrar.
packages/shared/src/schemas.ts:30,45,80,88: muerto: userSchema/recipeSummarySchema/listSummarySchema/ERROR_CODES solo se leen en z.infer o typeof; ningún .parse ni zValidator los usa → objeto runtime emitido y nunca ejecutado. Declarar esos tipos directamente.
apps/api/src/db/schema.ts:51: muerto: 2ª columna de recipes_user_title_idx (f_unaccent(lower(title))) nunca entra en Index Cond — EXPLAIN (ANALYZE) da Index Cond: (user_id = …) y el LIKE '%…%' (único uso, recipes/routes.ts:104) queda en Filter; coste = índice ~2× más ancho escrito en cada insert/update de receta con cero retorno. Dejar el índice en (userId).
```

## duplicado

```
apps/web/src/app/auth/login/login.spec.ts:71, login.spec.ts:94: duplicado: mismo describe('Login validation feedback') + mismo it + mismas aserciones; el test corre 2 veces. Borrar un bloque.
apps/web/src/app/cookbook/cookbook/cookbook.ts:11, cookbook/recipe-card/recipe-card.ts:12, lists/lists/lists.ts:7, recipes/recipe-detail/recipe-detail.ts:19: duplicado: plural() idéntico ×4. Extraer a shared/plural.ts.
apps/web/src/app/cookbook/cookbook/cookbook.ts:58, recipes/recipe-detail/recipe-detail.ts:46, recipes/recipe-form/recipe-form.ts:63: duplicado: misma detección (err.cause ?? err) instanceof HttpErrorResponse && status === 404 ×3. Extraer isNotFound() junto a auth/api-error.ts.
apps/web/src/app/cookbook/cookbook/cookbook.ts:113, recipes/recipe-detail/recipe-detail.ts:97: duplicado: clearTimeout + setTimeout(4000) para apagar el mensaje ×2. Extraer flash() a un helper compartido.
apps/api/src/recipes/routes.ts:17, apps/api/src/lists/routes.ts:21: duplicado: loadOwnedRecipe y loadOwnedList son el mismo patrón (UUID → 404, select id+userId → 404). Extraer loadOwned(table, db, userId, id).
apps/api/src/lists/routes.ts:32, apps/api/src/lists/routes.ts:48: duplicado: recipeCount calculado dos formas (count(*) por lista en toSummary vs leftJoin+groupBy en GET /). Un solo helper que devuelva todos los conteos en una query.
apps/web/src/app/lists/lists/lists.ts:134, apps/web/src/app/auth/api-error.ts:4: duplicado: dos parsers del body de error API (messageOf y apiError). Unificar en apiError añadiendo message.
apps/web/src/app/auth/login/login.ts:27, auth/signup/signup.ts:36, auth/account/account.ts:32: duplicado: fieldError (submitted + control.valid + mensaje por campo) ×3. Helper compartido.
apps/api/src/auth/routes.ts:59, apps/api/src/seed.ts:138: duplicado: alta de la lista Favorites en dos sitios; si cambia la regla (nombre, unicidad) seed queda desincronizado. Extraer createFavoritesList(tx, userId).
```

## lento

```
apps/web/src/app/cookbook/cookbook/cookbook.ts:50,68: lento: `all` llama GET /api/recipes sin límite (.limit() ausente en recipes/routes.ts:89) en cada visita a / o /lists/:id, solo para all.value().length del subtítulo → 1 request extra + N filas transferidas por navegación. Devolver el total en GET /api/lists (ya consulta listas) y leerlo de ahí.
apps/web/src/app/core/lists.service.ts:39,44: lento: add/removeRecipe hacen refresh() completo; un corazón en el grid = PUT + GET /api/lists por toggle (2 requests) y re-evalúa favoritesId/listName/meta. Actualizar recipeCount localmente (±1) y reservar refresh para create/rename/remove.
```

## Pendientes ya conocidos (ledger)

Los "minor (deferred)" de `.superpowers/sdd/2026-10-14-bonappetit-v2/deferred-and-rulings.md`
siguen abiertos (p. ej. import circular recipes/routes ↔ photos/routes, password change
fail-open, falta de specs de Lists/RecipeDetail). Este review no los repite; solo añade
hallazgos nuevos.
