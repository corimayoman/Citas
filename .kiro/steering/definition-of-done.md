---
inclusion: auto
---

# Definition of Done — Reglas obligatorias para cada cambio

Antes de considerar cualquier tarea como completada, SIEMPRE debo verificar y cumplir TODOS estos puntos:

## 1. Tests de regresión
- Si modifiqué lógica de backend (services, routes, middleware), DEBO agregar o actualizar tests unitarios que cubran los casos nuevos.
- Correr `npx jest --forceExit --detectOpenHandles` y verificar que TODOS los tests pasan antes de commitear.
- No commitear código sin tests si hay lógica nueva.

## 2. Documentación
- Si agregué o modifiqué un endpoint de API, DEBO actualizar la tabla de endpoints en `README.md`.
- Si cambié el comportamiento de una feature existente, DEBO actualizar la sección correspondiente del `README.md`.
- Si modifiqué integraciones (pagos, notificaciones, conectores), DEBO actualizar `MOCKS.md`.
- Si agregué variables de entorno nuevas, DEBO agregarlas a la tabla de variables en `README.md` y al `.env.example`.

## 3. TypeScript
- Correr `npx tsc --noEmit` en el workspace afectado (frontend/backend) antes de commitear.

## 4. Checklist mental antes de decir "listo"
- [ ] ¿Hay tests nuevos para la lógica que agregué?
- [ ] ¿La documentación refleja el cambio?
- [ ] ¿TypeScript compila sin errores?
- [ ] ¿Los 82+ tests de regresión pasan?
