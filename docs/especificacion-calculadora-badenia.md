# Especificacion funcional y tecnica
## Mejora de la calculadora de compra de vivienda y financiacion con Badenia

**Documento para:** desarrollo, producto y validacion financiera  
**Objetivo:** convertir la calculadora actual en una herramienta de asesoramiento que ayude al cliente a comprar la vivienda que desea, siempre que exista una estructura de financiacion viable y sostenible.  
**Principio rector:** el deseo de compra es el punto de partida. La herramienta debe buscar y comparar soluciones realistas, no forzar un producto ni ocultar riesgos, costes o condiciones.

---

## 0. Instrucciones generales de implementacion

### ORDEN 0.1 — Separar el motor financiero de la interfaz

**Instruccion:** crear un modulo de calculo independiente de los componentes visuales. La interfaz debe enviar datos al motor y recibir resultados estructurados; no debe contener formulas financieras dispersas en botones, campos o graficos.

**Ventaja:** una misma formula se utiliza en todos los escenarios y pantallas. Se reducen errores por duplicacion y se pueden probar los calculos sin depender de la interfaz.

### ORDEN 0.2 — No codificar condiciones Badenia directamente en el codigo

**Instruccion:** guardar las condiciones de cada tarifa en una configuracion versionada, con fuente, fecha de vigencia y fecha de ultima revision. Como minimo, registrar:

- nombre exacto de tarifa y variante;
- suma contractual y rangos aplicables;
- ahorro minimo exigido;
- tipo nominal y tipo efectivo publicados;
- Regelsparbeitrag y reglas de aportaciones extraordinarias;
- comision de apertura y otros costes;
- reglas de Bewertungszahl y Zuteilung;
- tabla de Tilgungsbeitrag o amortizacion;
- requisitos de concesion, garantias y documentacion;
- restricciones y combinaciones permitidas.

**Ventaja:** se pueden actualizar las condiciones sin reprogramar la calculadora y se evita utilizar un tipo de interes de una variante junto con las cuotas o reglas de otra.

### ORDEN 0.3 — Marcar cada dato segun su procedencia

**Instruccion:** cada parametro debe identificarse como uno de estos tipos:

1. `official_product_value`: dato tomado de la documentacion contractual vigente.
2. `customer_input`: dato introducido por el cliente.
3. `market_offer`: dato de una oferta bancaria concreta.
4. `simulation_assumption`: hipotesis de simulacion, por ejemplo un tipo futuro del 5 %.
5. `estimated_value`: resultado estimado que no constituye una garantia.

**Ventaja:** el asesor puede explicar de donde sale cada resultado y el cliente distingue una condicion contractual de una hipotesis.

### ORDEN 0.4 — No presentar estimaciones como promesas

**Instruccion:** ninguna fecha estimada de Zuteilung, aprobacion de credito, tipo futuro o ahorro comparativo debe etiquetarse como garantizada salvo que exista una confirmacion contractual expresa que lo permita.

**Ventaja:** protege al cliente, al asesor y a la organizacion; mejora la confianza y evita expectativas incorrectas.

---

# FASE 1. Reconstruir la necesidad de compra

## ORDEN 1.1 — Desglosar el coste total de adquisicion

**Instruccion:** sustituir el campo global de gastos de compra por campos separados:

- precio de compra;
- impuesto de adquisicion inmobiliaria (`Grunderwerbsteuer`), segun el Bundesland y la fecha aplicable;
- notario;
- registro de la propiedad (`Grundbuch`);
- comision de agencia (`Maklerprovision`), si existe;
- reformas y modernizacion;
- mudanza y otros gastos iniciales;
- otros costes individualizados.

Permitir introducir un importe fijo o un porcentaje para cada partida. Cuando se conozca el Bundesland, proponer el tipo del impuesto desde una tabla de datos actualizable, pero permitir confirmar o corregir el importe con el documento de la operacion.

**Ventaja:** el 10 % global puede ser demasiado alto o demasiado bajo para una operacion concreta. El desglose da transparencia y evita que la financiacion necesaria se calcule sobre gastos inventados o aproximados.

## ORDEN 1.2 — Separar patrimonio disponible y capital que el cliente desea conservar

**Instruccion:** solicitar:

- capital disponible total;
- reserva de emergencia que el cliente quiere mantener;
- capital comprometido para otros fines;
- ayudas o subvenciones confirmadas, si las hay.

Calcular:

```text
capital_utilizable = capital_disponible
                    - reserva_mantenida
                    - capital_comprometido
                    + ayudas_confirmadas
```

No sumar ayudas no aprobadas como si fueran dinero disponible. Mostrar por separado las ayudas solicitadas o hipoteticas.

**Ventaja:** evita que el plan consuma toda la liquidez del hogar y permite comprar sin dejar al cliente sin margen para averias, mudanza o imprevistos.

## ORDEN 1.3 — Calcular la necesidad total de fondos

**Instruccion:** utilizar una formula unica y visible:

```text
coste_total_compra = precio_compra
                   + impuesto_adquisicion
                   + notario
                   + grundbuch
                   + comision_agencia
                   + reformas
                   + mudanza_y_otros_costes

financiacion_necesaria = coste_total_compra - capital_utilizable
```

Validar que todos los importes son no negativos y que no se cuenta dos veces una misma partida.

**Ventaja:** todas las alternativas parten de la misma necesidad financiera. El usuario entiende exactamente que parte corresponde a la vivienda, que parte a los gastos y que parte debe financiar.

## ORDEN 1.4 — Preguntar cuando quiere comprar

**Instruccion:** incluir tres opciones claras:

- quiero comprar ahora;
- quiero comprar en los proximos 12 meses;
- puedo esperar y planificar una compra futura.

Guardar la fecha objetivo concreta si el cliente la conoce.

**Ventaja:** evita recomendar un contrato de ahorro previo a alguien que necesita el dinero para comprar hoy. La fecha de compra condiciona toda la estructura financiera.

---

# FASE 2. Calcular la capacidad de pago sostenible

## ORDEN 2.1 — Capturar el presupuesto real del hogar

**Instruccion:** solicitar, como minimo:

- ingresos netos mensuales estables;
- ingresos variables, identificados por separado;
- numero de personas que aportan ingresos;
- personas dependientes;
- gastos fijos del hogar;
- alquiler o coste actual de vivienda;
- prestamos, leasing, tarjetas y otras obligaciones;
- gastos de seguros, transporte y manutencion;
- ahorro mensual habitual;
- presupuesto maximo que el cliente quiere dedicar a la vivienda.

No asumir que todos los ingresos variables estan garantizados. Permitir indicar que parte es recurrente y que parte es extraordinaria.

**Ventaja:** dos hogares con los mismos ingresos pueden tener capacidades de pago muy distintas. La recomendacion se ajusta a la realidad del cliente y no solo a un porcentaje general.

## ORDEN 2.2 — Calcular dos limites de cuota

**Instruccion:** mantener un limite porcentual configurable y calcular tambien el presupuesto residual.

```text
limite_por_ingresos = ingresos_netos_reconocidos * porcentaje_limite

presupuesto_residual = ingresos_netos_reconocidos
                      - gastos_hogar
                      - obligaciones_existentes
                      - reserva_mensual_imprevistos

cuota_maxima_modelo = min(limite_por_ingresos,
                          presupuesto_residual,
                          presupuesto_deseado_cliente)
```

El porcentaje limite es un parametro de evaluacion, no una regla universal ni una aprobacion crediticia. La cifra final debe respetar tambien los criterios de solvencia de la entidad financiadora.

**Ventaja:** se evita que una cuota aparentemente aceptable por porcentaje deje al hogar sin dinero suficiente para vivir.

## ORDEN 2.3 — Incorporar costes de propietario

**Instruccion:** estimar y mostrar, por separado de la cuota del prestamo:

- mantenimiento y reparaciones;
- gastos de comunidad (`Hausgeld`), cuando proceda;
- seguros y tributos recurrentes;
- energia y suministros;
- otros costes recurrentes de la vivienda.

Permitir que el asesor sustituya las estimaciones por importes conocidos.

**Ventaja:** el cliente ve el coste mensual de vivir en la vivienda, no solo la cuota bancaria. Reduce el riesgo de que la compra resulte insostenible despues de firmar.

## ORDEN 2.4 — No bloquear la compra por un primer resultado desfavorable

**Instruccion:** si la cuota supera el presupuesto, mostrar alternativas que puedan mejorar la viabilidad: modificar el capital inicial, ajustar el precio objetivo, cambiar la estructura, revisar el plazo, comparar otra entidad o estudiar una fecha de compra posterior. No ocultar la diferencia ni crear una aprobacion ficticia.

**Ventaja:** la conversacion sigue orientada a encontrar una solucion. El cliente recibe opciones concretas en lugar de un mensaje abrupto de rechazo.

---

# FASE 3. Crear el catalogo contractual de Badenia

## ORDEN 3.1 — Crear un registro separado por cada tarifa y variante

**Instruccion:** no utilizar una unica tasa de interes Badenia para todos los contratos. Crear un registro por variante y, cuando la documentacion lo exija, por rango de suma contractual.

Cada registro debe incluir los campos definidos en la ORDEN 0.2 y una referencia a los documentos oficiales utilizados: ABB, tarifario, informacion precontractual, tabla de amortizacion y condiciones adicionales.

**Ventaja:** impide mezclar caracteristicas de ClassicFinanz, Niedrige Rate, Niedriger Zins, FinanzSpezial u otras variantes. El calculo refleja la tarifa realmente seleccionada.

## ORDEN 3.2 — Validar elegibilidad antes de mostrar una variante

**Instruccion:** crear reglas de elegibilidad para cada variante. Validar suma contractual, importe minimo o maximo, porcentaje de ahorro, requisitos del producto y combinaciones permitidas con otras financiaciones.

Si falta un dato oficial o una condicion no esta verificada, marcar la variante como `pendiente_de_validacion` y no generar una oferta calculada como si estuviera confirmada.

**Ventaja:** el cliente solo ve opciones que tienen una base contractual identificable. Se evitan comparaciones con condiciones que no pueden contratarse juntas.

## ORDEN 3.3 — Incorporar los costes contractuales

**Instruccion:** incorporar la Abschlussgebuehr y cualquier coste adicional aplicable segun la documentacion vigente. Si la comision es un porcentaje de la Bausparsumme, calcularla con la formula documentada:

```text
abschlussgebuehr = bausparsumme * gebuehr_prozent
```

El porcentaje debe proceder del registro contractual versionado, no de una constante global. Mostrar cuando se cobra, si se financia, si se paga con fondos propios y si existe alguna condicion de reembolso.

**Ventaja:** el coste real se incluye desde el principio y no aparece como sorpresa al final. Se pueden comparar ofertas con una base de costes completa.

## ORDEN 3.4 — Separar tipos de interes

**Instruccion:** guardar y presentar por separado:

- `sollzins`: tipo nominal;
- `effektiver_jahreszins`: tipo efectivo publicado o calculado conforme a las reglas aplicables;
- tipo de financiacion inicial;
- tipo de Bauspardarlehen;
- tipo supuesto para una refinanciacion futura.

No copiar un tipo efectivo de una tabla a otra variante ni calcularlo solo a partir del tipo nominal.

**Ventaja:** evita comparar conceptos diferentes y hace comprensible el coste real de cada financiacion.

---

# FASE 4. Calcular correctamente el ahorro y la Zuteilung

## ORDEN 4.1 — Separar ahorro ordinario y aportaciones extraordinarias

**Instruccion:** crear campos independientes para:

- Regelsparbeitrag contractual;
- aportacion mensual voluntaria;
- Sonderzahlungen;
- saldo inicial;
- intereses del ahorro;
- bonificaciones, solo cuando sean aplicables y esten documentadas.

No asumir que una aportacion extraordinaria sera aceptada automaticamente. Aplicar los limites y autorizaciones definidos por Badenia.

**Ventaja:** distingue la cuota ordinaria del plan intensivo de ahorro y evita presentar una aportacion extraordinaria como si fuera una obligacion o un derecho contractual.

## ORDEN 4.2 — Calcular el saldo de ahorro periodo a periodo

**Instruccion:** construir un calendario mensual o con la periodicidad de calculo contractual. Para cada periodo registrar saldo inicial, aportacion, intereses, costes cargados y saldo final.

```text
saldo_final_periodo = saldo_inicial_periodo
                    + aportacion_aceptada
                    + intereses_acreditados
                    - cargos_aplicables
```

La formula de intereses, fecha valor y redondeo debe replicar las condiciones oficiales. No utilizar una aproximacion de interes simple si el contrato utiliza otra metodologia.

**Ventaja:** la fecha y el importe de ahorro se calculan a partir de los movimientos reales del contrato, no mediante una division simplificada.

## ORDEN 4.3 — Implementar la Bewertungszahl exactamente como la define Badenia

**Instruccion:** incorporar la formula, las fechas de corte, los factores y las reglas de valoracion desde la version vigente de las ABB y documentacion tarifaria. No reconstruir la formula por intuicion ni extrapolarla de un ejemplo.

Si el mecanismo requiere una tabla o calculo facilitado por Badenia, utilizar esa tabla o integrar el metodo autorizado. Registrar la fuente y version de cada parametro.

**Ventaja:** la Bewertungszahl es uno de los elementos que afectan a la asignacion. Un calculo aproximado puede adelantar o retrasar indebidamente la fecha estimada.

## ORDEN 4.4 — Tratar la Zuteilung como un proceso con condiciones

**Instruccion:** comprobar separadamente:

1. ahorro minimo exigido;
2. Mindestbewertungszahl;
3. fecha de valoracion;
4. Zielbewertungszahl o criterio de asignacion aplicable;
5. disponibilidad y reglas de asignacion del colectivo;
6. requisitos adicionales de concesion del prestamo.

El motor debe devolver un estado, no solo una fecha:

- `not_yet_eligible`: todavia no cumple las condiciones;
- `eligible_not_allocated`: cumple condiciones previas, pero no se ha confirmado asignacion;
- `estimated_allocation`: estimacion basada en hipotesis explicitas;
- `allocation_confirmed`: solo si existe confirmacion valida;
- `requires_manual_check`: falta informacion o intervencion de Badenia.

**Ventaja:** el cliente entiende que alcanzar el ahorro minimo no garantiza por si solo la asignacion. Se evita prometer una fecha que depende de reglas colectivas o condiciones no controladas por la calculadora.

## ORDEN 4.5 — Mostrar un rango y los factores que cambian la estimacion

**Instruccion:** si Badenia permite una simulacion orientativa, mostrar una fecha o rango estimado junto con las hipotesis: aportacion mensual, pagos extraordinarios aceptados, saldo, Bewertungszahl y calendario de asignacion. Si no es posible simular con fiabilidad, mostrar `fecha no confirmable con los datos disponibles`.

**Ventaja:** una estimacion transparente es mas util que una fecha aparentemente exacta pero no sustentada.

---

# FASE 5. Modelar las tres rutas de compra

## ORDEN 5.1 — Crear el escenario de compra inmediata con banco

**Instruccion:** modelar el prestamo bancario que permite disponer del dinero en la fecha de compra. Capturar importe, tipo nominal, tipo efectivo, periodo de tipo fijo, plazo total, cuota, amortizacion inicial, amortizaciones extraordinarias permitidas, costes y condiciones de refinanciacion.

**Ventaja:** ofrece una referencia comprensible para el cliente que quiere comprar ahora y permite conocer la deuda pendiente al terminar el periodo de interes fijo.

## ORDEN 5.2 — Crear el escenario de compra inmediata con financiacion combinada

**Instruccion:** no asumir que un Bausparvertrag en fase de ahorro aporta ya el importe de compra. Modelar por separado:

- financiacion inicial que permite comprar hoy;
- contrato de ahorro Badenia;
- aportaciones mensuales y extraordinarias aceptadas;
- fecha estimada o confirmada de asignacion;
- saldo del ahorro en la fecha de utilizacion;
- Bauspardarlehen resultante;
- deuda bancaria restante;
- posible solapamiento de cuotas;
- amortizacion y costes de cada tramo.

Comprobar que la estructura esta permitida por las condiciones de los productos y que la entidad financiadora aprueba la operacion.

**Ventaja:** el cliente puede estudiar la compra inmediata sin confundir el ahorro futuro con dinero disponible hoy. Tambien puede valorar si la planificacion de Badenia aporta seguridad o ventajas suficientes para justificar sus costes.

## ORDEN 5.3 — Crear el escenario de compra futura

**Instruccion:** modelar el periodo de ahorro previo, la evolucion de la liquidez, la posible asignacion, el prestamo disponible y la fecha objetivo de compra. La fecha solo debe presentarse como viable si se cumplen los requisitos y se han contemplado los gastos de adquisicion.

**Ventaja:** permite ayudar a clientes que tienen un objetivo de compra real, pero necesitan tiempo para reunir capital o cumplir condiciones de financiacion.

## ORDEN 5.4 — No combinar productos incompatibles

**Instruccion:** crear una matriz de compatibilidad de productos y financiaciones. Para variantes que exijan una financiacion inmediata u otro contrato asociado, validar todos los componentes antes de presentar el escenario como disponible.

**Ventaja:** evita construir simulaciones matematicamente posibles, pero contractualmente no contratables.

---

# FASE 6. Calcular el Bauspardarlehen y la amortizacion

## ORDEN 6.1 — Calcular el importe disponible para el prestamo

**Instruccion:** derivar el Bauspardarlehen de la Bausparsumme y del saldo de ahorro y otros componentes que las condiciones contractuales indiquen. Utilizar la definicion exacta de la variante y respetar los ajustes por intereses, bonificaciones o cargos.

No utilizar una formula generica si la documentacion de la variante establece otra base de calculo.

**Ventaja:** el capital del prestamo se ajusta a lo que realmente puede concederse y no a una estimacion simplificada.

## ORDEN 6.2 — Seleccionar la Tilgungsstaffel contractual

**Instruccion:** recuperar el Tilgungsbeitrag o la cuota contractual de la tabla vigente segun variante, suma contractual y Bewertungszahl. No permitir al usuario escribir un tipo de amortizacion arbitrario que no corresponda al contrato.

Cuando la tarifa defina un calculo por cada mil de la suma contractual, aplicar la formula indicada en el documento oficial y guardar la unidad de medida:

```text
cuota_contractual = bausparsumme * tilgungsbeitrag_pro_mil / 1000
```

Esta formula solo se debe activar para una variante cuya documentacion confirme ese metodo.

**Ventaja:** la cuota se corresponde con la tabla de amortizacion real y se evitan plazos ficticios.

## ORDEN 6.3 — Generar el cuadro de amortizacion

**Instruccion:** generar una fila por periodo con:

- saldo inicial;
- cuota;
- intereses;
- amortizacion de capital;
- costes incluidos, si proceden;
- saldo final.

Validar que la deuda no se vuelve negativa y que el saldo final coincide con el resultado contractual, aplicando las reglas de redondeo y ultima cuota.

**Ventaja:** el cliente puede ver cuanto paga, cuanto reduce su deuda y cuando termina cada tramo de financiacion.

## ORDEN 6.4 — Mostrar por separado cuota, tipo y duracion

**Instruccion:** en la pantalla de resultados, mostrar por separado el Sollzins, el efectivo anual, la cuota contractual, la duracion estimada y el total de intereses. No deducir una duracion a partir de la cuota sin tener en cuenta las reglas de amortizacion.

**Ventaja:** evita que el cliente confunda una cuota baja con un coste total bajo o con una amortizacion mas rapida.

---

# FASE 7. Rehacer el calculador bancario y el riesgo de refinanciacion

## ORDEN 7.1 — Utilizar una amortizacion mensual verificable

**Instruccion:** para un prestamo de cuota constante, utilizar la formula de anualidad con tipo mensual equivalente y numero de cuotas correcto:

```text
cuota = principal * i * (1 + i)^n / ((1 + i)^n - 1)
```

Donde `i` es el tipo mensual aplicable y `n` el numero de periodos. Si el contrato utiliza fechas, convenciones o cuotas distintas, replicar las condiciones de la oferta real.

**Ventaja:** la cuota y el saldo pendiente pueden verificarse matematicamente y compararse con el cuadro de amortizacion del banco.

## ORDEN 7.2 — Separar periodo de interes fijo y plazo total

**Instruccion:** pedir dos datos distintos: `zinsbindung_monate` y `gesamt_laufzeit_monate`. Calcular el saldo pendiente exactamente en la fecha de fin del tipo fijo.

**Ventaja:** no se da a entender que un tipo del 4,2 % a diez años este garantizado durante los treinta años de plazo.

## ORDEN 7.3 — Simular escenarios de Anschlussfinanzierung

**Instruccion:** calcular la nueva cuota para varios tipos futuros configurables, por ejemplo 3 %, 4,2 %, 5 %, 6 % y 7 %. Estos valores son escenarios de estres y no previsiones de mercado. Mantener el mismo saldo pendiente y variar el tipo, el plazo restante y la amortizacion segun el supuesto seleccionado.

**Ventaja:** el cliente ve como podria cambiar su presupuesto mensual si los tipos fueran mas altos o mas bajos al finalizar la Zinsbindung.

## ORDEN 7.4 — Incorporar amortizaciones extraordinarias y flexibilidad

**Instruccion:** cuando la oferta bancaria lo permita, modelar Sondertilgung, cambios de amortizacion y otras opciones. No asumir que estan disponibles sin revisar la oferta.

**Ventaja:** se compara no solo el tipo de interes, sino tambien la flexibilidad que puede ser importante para el cliente.

---

# FASE 8. Crear un comparador justo y un calculo de coste total

## ORDEN 8.1 — Comparar el mismo proyecto y la misma fecha de compra

**Instruccion:** todas las alternativas deben compartir precio de vivienda, gastos, capital propio utilizable, fecha objetivo y necesidad total de fondos. Si una alternativa no permite comprar en esa fecha, indicarlo como una diferencia de viabilidad, no ocultarlo.

**Ventaja:** evita que una estructura parezca mejor porque se compara con un proyecto o una fecha distinta.

## ORDEN 8.2 — Comparar con el mismo horizonte temporal

**Instruccion:** permitir comparar a 10, 15, 20, 25 y 30 anos o en una fecha especificada. En cada horizonte mostrar deuda pendiente, saldo de ahorro, desembolsos y costes acumulados.

**Ventaja:** evita comparar, por ejemplo, una fase de prestamo de diez anos con una financiacion bancaria de treinta anos como si fueran periodos equivalentes.

## ORDEN 8.3 — Separar desembolsos, coste financiero y deuda

**Instruccion:** no llamar "coste" a la suma de todas las cuotas sin desglosar el capital amortizado. Mostrar al menos:

- total de pagos realizados;
- capital amortizado;
- intereses pagados;
- comisiones y gastos;
- saldo de ahorro que sigue siendo un activo del cliente;
- deuda pendiente por cada financiacion;
- coste financiero neto segun la metodologia definida.

**Ventaja:** impide contar el capital devuelto como si fuera un gasto y evita contar dos veces el dinero ahorrado o utilizado para cancelar otra deuda.

## ORDEN 8.4 — Definir una metodologia comun de coste total

**Instruccion:** documentar exactamente que conceptos se incluyen en el coste total. Para cada escenario generar un flujo de caja por fecha. Si se utiliza valor actual neto, declarar la tasa de descuento y aplicarla a todos los escenarios por igual. No mezclar valores nominales con valores actuales.

**Ventaja:** las diferencias de coste son reproducibles y se pueden explicar al cliente o revisar por un especialista.

## ORDEN 8.5 — No publicar ahorros comparativos sin auditoria

**Instruccion:** cualquier afirmacion como "ahorras 124.168 EUR" debe estar deshabilitada hasta que:

1. todos los flujos esten completos;
2. el horizonte sea identico;
3. los costes esten incluidos;
4. las deudas pendientes esten calculadas;
5. se hayan comprobado posibles dobles contabilizaciones;
6. otro calculo independiente reproduzca el resultado.

**Ventaja:** evita mensajes comerciales llamativos pero incorrectos y protege la credibilidad del asesor.

---

# FASE 9. Redisenar la experiencia y los mensajes para el cliente

## ORDEN 9.1 — Empezar por la vivienda, no por el producto

**Instruccion:** ordenar las pantallas asi:

1. Tu proyecto de vivienda.
2. Cuanto dinero necesitas.
3. Tu presupuesto mensual y reserva.
4. Cuando quieres comprar.
5. Opciones para financiar la compra.
6. Comparacion de cuotas, costes y riesgos.
7. Resumen y siguientes pasos.

Presentar Badenia dentro de las alternativas de financiacion, no como punto de partida obligatorio.

**Ventaja:** el cliente siente que la herramienta trabaja para su objetivo de compra y no que se le intenta vender primero un producto.

## ORDEN 9.2 — Presentar tres rutas claras

**Instruccion:** mostrar, cuando sean tecnicamente aplicables:

- compra ahora con banco;
- compra ahora con financiacion combinada;
- ahorro y compra futura.

Cada tarjeta debe incluir cuota durante cada fase, fecha estimada de compra o asignacion, costes, saldo/deuda al horizonte elegido y principales riesgos.

**Ventaja:** el cliente puede comparar distintas formas de conseguir su objetivo en vez de recibir una unica solucion predeterminada.

## ORDEN 9.3 — Sustituir mensajes alarmistas por alternativas concretas

**Instruccion:** no mostrar mensajes como "no puedes comprar" cuando una estructura no encaja. Mostrar el motivo y las alternativas posibles, por ejemplo:

- "Podemos revisar la aportacion inicial para conservar una reserva".
- "Podemos estudiar una estructura con una cuota mensual mas comoda".
- "Podemos comparar un plazo diferente de interes fijo".
- "Podemos estudiar una fecha de compra distinta".
- "Podemos calcular que presupuesto de vivienda encaja mejor con tu cuota objetivo".

No afirmar que una alternativa es viable hasta que el motor la haya calculado y se hayan cumplido sus requisitos.

**Ventaja:** mantiene una conversacion constructiva y centrada en soluciones, sin ocultar una limitacion economica.

## ORDEN 9.4 — Mostrar ventajas y desventajas de cada opcion

**Instruccion:** cada alternativa debe mostrar al menos dos ventajas y dos limitaciones, si existen. Por ejemplo, un tipo fijo puede aportar previsibilidad, pero una cuota, comision o plazo puede ser menos flexible. Una cuota bancaria inicial menor puede aliviar el presupuesto, pero dejar una deuda residual y riesgo de refinanciacion.

**Ventaja:** asesoria equilibrada y comprensible. El cliente entiende por que una opcion puede ser adecuada y que compromisos implica.

## ORDEN 9.5 — Explicar los resultados sin jerga innecesaria

**Instruccion:** incluir definiciones desplegables para Bausparsumme, Regelsparbeitrag, Sonderzahlung, Bewertungszahl, Zuteilung, Bauspardarlehen, Sollzins, Effektivzins y Zinsbindung.

**Ventaja:** el cliente entiende la propuesta y puede participar en la decision sin necesitar conocimientos previos de Bausparen.

---

# FASE 10. Crear el motor de recomendacion

## ORDEN 10.1 — Aplicar filtros de viabilidad antes de ordenar resultados

**Instruccion:** descartar o marcar como no disponible cualquier escenario que:

- no cubra la necesidad de fondos en la fecha deseada;
- incumpla condiciones del producto;
- supere el presupuesto mensual disponible;
- dependa de una aprobacion o asignacion no confirmada;
- no conserve la reserva minima definida por el cliente;
- utilice datos contractuales caducados o no validados.

**Ventaja:** el motor no recomienda primero una opcion atractiva en pantalla pero imposible de contratar o pagar.

## ORDEN 10.2 — Puntuar escenarios viables con criterios transparentes

**Instruccion:** ordenar las opciones viables atendiendo a criterios visibles:

1. posibilidad de comprar en la fecha deseada;
2. cuota sostenible en cada fase;
3. liquidez que conserva el cliente;
4. coste financiero total en el horizonte elegido;
5. riesgo de refinanciacion;
6. flexibilidad contractual;
7. incertidumbre de asignacion o aprobacion.

No utilizar un peso oculto que favorezca Badenia. Permitir que el asesor y el cliente vean por que una opcion aparece primero.

**Ventaja:** la recomendacion se basa en las prioridades reales del cliente y no en la marca del producto.

## ORDEN 10.3 — Generar alternativas cuando no exista una opcion plenamente viable

**Instruccion:** buscar cambios limitados y explicables en capital inicial, precio objetivo, fecha de compra, plazo, cuota, estructura o variante. Mostrar que variable se ha modificado y cual es el efecto.

**Ventaja:** permite seguir trabajando para alcanzar el objetivo de compra sin presentar como viable una estructura que no lo es.

---

# FASE 11. Pruebas, control de calidad y aprobacion

## ORDEN 11.1 — Crear pruebas unitarias para cada formula

**Instruccion:** probar por separado:

- calculo de gastos de adquisicion;
- capital utilizable;
- financiacion necesaria;
- capacidad de pago;
- cuota bancaria;
- saldo bancario pendiente;
- saldo de ahorro;
- comision de apertura;
- calculo contractual de Bauspardarlehen;
- Tilgungsstaffel;
- flujo de caja y coste total.

**Ventaja:** cuando una formula falla, se identifica el modulo afectado sin tener que revisar toda la calculadora.

## ORDEN 11.2 — Crear casos de prueba de extremo a extremo

**Instruccion:** utilizar como minimo estos escenarios de prueba, sin tratarlos como ofertas reales:

| Caso | Precio | Gastos de ejemplo | Capital disponible | Reserva | Objetivo de compra |
|---|---:|---:|---:|---:|---|
| A | 150.000 EUR | 15.000 EUR | 30.000 EUR | 5.000 EUR | Ahora |
| B | 180.000 EUR | 18.000 EUR | 40.000 EUR | 5.000 EUR | Ahora |
| C | 200.000 EUR | 20.000 EUR | 40.000 EUR | 5.000 EUR | Ahora |
| D | 250.000 EUR | 25.000 EUR | 60.000 EUR | 10.000 EUR | En 12 meses |
| E | 300.000 EUR | 30.000 EUR | 80.000 EUR | 15.000 EUR | Compra futura |

En cada caso probar al menos tres niveles de ingresos, dos cuotas objetivo, varias duraciones y distintos tipos de refinanciacion. Los gastos de ejemplo se deben sustituir por los gastos reales cuando se trate de un cliente.

**Ventaja:** permite descubrir errores con importes pequenos y grandes, diferentes niveles de liquidez y diferentes deseos de compra.

## ORDEN 11.3 — Comparar con una fuente independiente

**Instruccion:** contrastar los cuadros de amortizacion bancarios con una calculadora financiera independiente y los resultados Badenia con simulaciones o documentos contractuales oficiales. Documentar discrepancias y no publicar hasta resolverlas.

**Ventaja:** una segunda comprobacion detecta errores de implementacion que pueden pasar inadvertidos en pruebas internas.

## ORDEN 11.4 — Validar con especialistas y documentacion vigente

**Instruccion:** obtener confirmacion de Badenia o de la documentacion interna autorizada para todos los parametros especificos del producto: tarifas, ABB, reglas de Bewertungszahl, asignacion, amortizacion, costes, requisitos y compatibilidades. Registrar responsable y fecha de validacion.

**Ventaja:** la herramienta no depende de datos antiguos, interpretaciones informales o valores de una simulacion anterior.

## ORDEN 11.5 — Bloquear resultados cuando falten datos criticos

**Instruccion:** si falta una condicion imprescindible, mostrar `calculo incompleto - requiere validacion` en vez de inventar el dato, aproximarlo silenciosamente o extrapolar otra variante.

**Ventaja:** es preferible un resultado pendiente de confirmacion a una cifra precisa pero falsa.

---

# 12. Requisitos minimos de interfaz y salida

## ORDEN 12.1 — Mostrar un resumen de una pagina

**Instruccion:** generar un resumen imprimible o exportable con:

- vivienda y costes de adquisicion;
- capital propio y reserva conservada;
- necesidad de financiacion;
- presupuesto mensual del hogar;
- alternativa analizada;
- cuotas por fase;
- intereses y comisiones;
- deuda y saldo de ahorro en fechas clave;
- riesgos y condiciones pendientes;
- supuestos utilizados;
- version y fecha de la informacion Badenia.

**Ventaja:** el cliente puede revisar la propuesta despues de la cita y comparar alternativas sin depender de recordar una explicacion verbal.

## ORDEN 12.2 — Mostrar las fases de pago en una linea temporal

**Instruccion:** crear una linea temporal mensual o anual que separe ahorro, financiacion inicial, asignacion, Bauspardarlehen, refinanciacion y amortizacion final. Mostrar el total de cuotas mensuales en cada fase, incluyendo cuotas que coincidan.

**Ventaja:** hace visible el esfuerzo economico real, especialmente durante periodos en los que se pagan dos productos a la vez.

## ORDEN 12.3 — Etiquetar claramente las cifras

**Instruccion:** utilizar etiquetas distintas para:

- dato confirmado;
- dato introducido por el cliente;
- estimacion;
- hipotesis;
- condicion pendiente;
- escenario de estres.

**Ventaja:** mejora la transparencia y evita que una hipotesis se interprete como una promesa contractual.

---

# 13. Criterios de aceptacion antes de publicar

La calculadora solo se considera lista cuando se cumplen todos estos puntos:

- [ ] El coste total de compra se calcula a partir de partidas desglosadas.
- [ ] La reserva del cliente se resta del capital disponible.
- [ ] La capacidad de pago incluye gastos y otras obligaciones.
- [ ] La fecha deseada de compra determina las rutas que se muestran.
- [ ] Cada variante Badenia utiliza exclusivamente sus propios parametros vigentes.
- [ ] Las aportaciones ordinarias y extraordinarias estan separadas.
- [ ] La Bewertungszahl se calcula segun documentacion oficial vigente.
- [ ] La Zuteilung no se presenta como garantizada cuando no lo esta.
- [ ] El Bauspardarlehen y su amortizacion siguen la tarifa aplicable.
- [ ] La financiacion inicial y el Bauspardarlehen aparecen como deudas separadas.
- [ ] El solapamiento de cuotas se calcula en los meses correspondientes.
- [ ] La Zinsbindung y el plazo total del prestamo bancario son campos distintos.
- [ ] La refinanciacion se simula con tipos alternativos claramente identificados como hipotesis.
- [ ] Las comparaciones usan el mismo horizonte temporal y la misma necesidad de fondos.
- [ ] El coste financiero no confunde capital amortizado con intereses o gastos.
- [ ] El ahorro del cliente no se cuenta como un coste perdido.
- [ ] Ninguna afirmacion de ahorro se publica sin auditoria de flujos.
- [ ] Cada resultado identifica sus datos, supuestos y version de tarifa.
- [ ] Los casos de prueba pasan y han sido revisados por una segunda persona.
- [ ] Los parametros contractuales han sido validados con documentacion Badenia vigente.

---

# 14. Datos concretos de la captura que deben utilizarse como caso de regresion

La captura inicial debe conservarse como un caso de prueba historico para comprobar que las nuevas formulas detectan y explican las diferencias. No se deben forzar las nuevas formulas para reproducir los resultados antiguos.

| Dato de la captura | Valor introducido |
|---|---:|
| Precio de compra | 200.000 EUR |
| Gastos de compra configurados | 20.000 EUR |
| Capital propio | 40.000 EUR |
| Financiacion necesaria mostrada | 180.000 EUR |
| Ahorro mensual Badenia mostrado | 1.740 EUR |
| Ahorro minimo mostrado | 40 % |
| Tiempo de ahorro mostrado | 3,6 anos |
| Tipo nominal Badenia mostrado | 1,75 % |
| Cuota de prestamo Badenia mostrada | 982 EUR/mes |
| Tipo bancario mostrado | 4,20 % |
| Cuota bancaria mostrada | 881 EUR/mes |
| Tipo fijo bancario mostrado | 10 anos |
| Plazo bancario mostrado | 30 anos |

**Instruccion:** volver a calcular todos estos valores desde cero. Identificar cuales son entradas, cuales son hipotesis y cuales son resultados. Si el nuevo resultado difiere del antiguo, mostrar la causa; nunca ajustar una formula solo para que coincida con la captura.

**Ventaja:** se conserva una referencia conocida y se evita que una correccion rompa accidentalmente una parte que antes funcionaba.

---

# 15. Orden recomendado de desarrollo

Implementar en este orden y no avanzar a la siguiente entrega hasta que los criterios de aceptacion de la anterior esten superados.

| Entrega | Trabajo | Resultado que debe quedar terminado |
|---|---|---|
| 1 | Datos de compra y capacidad economica | Necesidad de fondos y presupuesto mensual fiables |
| 2 | Catalogo versionado Badenia | Parametros de cada variante separados y trazables |
| 3 | Ahorro y Zuteilung | Saldo, Bewertungszahl y estado de asignacion correctamente modelados |
| 4 | Bauspardarlehen y amortizacion | Cuota y saldo segun la variante y tabla vigente |
| 5 | Banco y financiacion combinada | Deudas, cuotas y refinanciacion separadas |
| 6 | Coste total y comparador | Flujos comparables en el mismo horizonte |
| 7 | Interfaz y recomendador | Alternativas claras, sostenibles y transparentes |
| 8 | Pruebas y aprobacion | Resultados validados y documentados antes de publicar |

**Ventaja:** el desarrollo se puede revisar por etapas. Los errores del motor financiero se corrigen antes de invertir tiempo en animaciones, graficos o mensajes comerciales.

---

# 16. Regla final de producto

La calculadora debe ayudar al cliente a responder cuatro preguntas, en este orden:

1. **Puedo comprar la vivienda que deseo en la fecha que quiero?**
2. **Que cuota puedo mantener sin poner en peligro la economia de mi hogar?**
3. **Que estructura de financiacion encaja mejor con mis prioridades y que riesgos tiene?**
4. **Que costes, condiciones y compromisos estoy aceptando?**

Badenia debe aparecer como una solucion de planificacion y financiacion cuando sus condiciones aporten valor al caso concreto. No se debe presuponer que es siempre la opcion mas barata, mas rapida o mas adecuada.

**Resultado esperado:** una herramienta que mantiene vivo el objetivo de compra, presenta caminos realistas para alcanzarlo, explica las ventajas de cada estructura y permite tomar una decision informada sin promesas ni comparaciones engañosas.

---

## Nota de control documental

Este documento es una especificacion funcional para desarrollo, no una oferta de financiacion ni una confirmacion de las condiciones contractuales actuales de Badenia. Antes de programar parametros especificos deben comprobarse las ABB, el tarifario, las tablas de amortizacion, los costes y las reglas de asignacion vigentes para la fecha de implementacion. Cualquier dato que no este respaldado por documentacion valida debe permanecer marcado como pendiente de verificacion.
