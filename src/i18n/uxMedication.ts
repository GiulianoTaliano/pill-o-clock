export default {
  en: {
    uxMedication: {
      identity: "Medication",
      plan: "Schedule",
      review: "Review treatment",
      edit: "Edit treatment",
      manage: "Manage",
      deleteHint:
        "Delete {{name}}? Reminders stop and this treatment will no longer appear in history or reports. Archive it instead to keep its history.",
      limitMax:
        "You recorded {{count}} doses today; your configured daily limit is {{max}}.",
      limitSoon:
        "According to your configured interval, the next time is {{time}}. This is not a recommendation to take a dose.",
      reviewHint: "Check the person, amount and next reminders before saving.",
      step: "Step {{current}} of {{total}}",
      optional: "Notes, supply and renewal",
      appearance: "Photo and color",
      save: "Save treatment",
      saved: "Treatment saved",
      cancelChanges: "Discard changes?",
      discardHint: "Your changes have not been saved.",
      keepEditing: "Keep editing",
      discard: "Discard",
      invalidNumber:
        "Enter a valid positive number (whole numbers for counts; supply allows zero).",
      dateRequired: "Choose the date of this dose.",
      duplicateSchedule:
        "Two reminders overlap at the same time. Change or remove one.",
      onceHint:
        "One dose on the selected date. Switching to this mode removes additional reminder times when you save.",
      once: "One dose",
      repeat: "Repeating",
      prn: "As needed",
      alarms: "Reminder times",
      advanced: "Advanced schedule",
      starts: "Starts {{date}}",
      ends: "Ends {{date}}",
      noEnd: "No end date",
      nextDates: "Upcoming reminders",
      noUpcoming:
        "No upcoming reminders in the next 62 days. Review the dates.",
      stockLabel: "Doses available",
      stockHint:
        "One recorded dose uses one available dose. This count is not tablets, mg or ml.",
      stockUnit: "doses",
      search: "Search medications",
      all: "All",
      active: "Active",
      paused: "Paused",
      archived: "Archived",
      noResults: "No matching medications",
      archive: "Archive treatment",
      archiveHint: "Reminders stop. Your history is kept.",
      reason: "Choose a reason",
      archivedSuccess: "Treatment archived",
      restored: "Treatment restored",
      pausedSuccess: "Reminders paused",
      activeSuccess: "Reminders resumed",
      operationError:
        "We could not complete the action. Check the current state and try again.",
      notificationsPending:
        "Treatment saved. Some reminders could not be scheduled. Check notification permissions and retry from Settings.",
      checkUnavailable:
        "Treatment saved. Ingredient checks could not be completed.",
      observations: "Review these observations",
      saveAnyway: "Save treatment anyway",
      reviewEdit: "Review treatment",
      checkUnknown:
        "Ingredients could not be checked for this name. This is not a drug interaction check.",
      scanReview:
        "Package found. Check the name and enter the amount you take; scanning does not verify your dose.",
      taking: "Registering…",
      registered: "Recorded",
      registeredWarning:
        "Dose recorded. Some reminders could not be updated. Check the current state before trying again.",
      closeReminder: "Close reminder",
      closeHint: "Closes this reminder without changing the dose record.",
      recordTaken: "Record as taken",
      originalTime: "Originally {{time}}",
      timePast: "Choose a future time today.",
      tomorrow: "Tomorrow",
      prnLast: "Last recorded: {{time}}",
      intervalHint:
        "Next reminder according to your configured interval: {{time}}.",
      missing: "This medication is no longer available.",
      retry: "Retry",
      daily: "Every day",
      schedule: "{{days}} · {{time}}",
      regimenAnchor:
        "Counted from {{date}}. Review the upcoming reminders below.",
      monthShort:
        "In shorter months, the reminder uses the last day of the month.",
    },
  },
  es: {
    uxMedication: {
      identity: "Medicamento",
      plan: "Pauta",
      review: "Revisar tratamiento",
      edit: "Editar tratamiento",
      manage: "Gestionar",
      deleteHint:
        "¿Eliminar {{name}}? Se detienen los recordatorios y el tratamiento deja de aparecer en el historial e informes. Para conservar su historial, archivá el tratamiento.",
      limitMax:
        "Registraste {{count}} tomas hoy; el límite diario que configuraste es {{max}}.",
      limitSoon:
        "Según el intervalo que configuraste, el próximo horario es {{time}}. Esto no recomienda tomar una dosis.",
      reviewHint:
        "Revisá la persona, la cantidad y los próximos recordatorios antes de guardar.",
      step: "Paso {{current}} de {{total}}",
      optional: "Notas, abastecimiento y receta",
      appearance: "Foto y color",
      save: "Guardar tratamiento",
      saved: "Tratamiento guardado",
      cancelChanges: "¿Descartar cambios?",
      discardHint: "Tus cambios todavía no se guardaron.",
      keepEditing: "Seguir editando",
      discard: "Descartar",
      invalidNumber:
        "Ingresá un número válido mayor a cero (entero para cantidades; stock admite cero).",
      dateRequired: "Elegí la fecha de esta dosis.",
      duplicateSchedule:
        "Dos recordatorios coinciden a la misma hora. Cambiá o quitá uno.",
      onceHint:
        "Una dosis en la fecha elegida. Al guardar este modo se quitan los horarios adicionales.",
      once: "Una dosis",
      repeat: "Repetir",
      prn: "A demanda",
      alarms: "Horarios de recordatorio",
      advanced: "Pauta avanzada",
      starts: "Desde el {{date}}",
      ends: "Hasta el {{date}}",
      noEnd: "Sin fecha de fin",
      nextDates: "Próximos recordatorios",
      noUpcoming:
        "No hay recordatorios en los próximos 62 días. Revisá las fechas.",
      stockLabel: "Tomas disponibles",
      stockHint:
        "Cada toma registrada descuenta una toma disponible. Este contador no representa comprimidos, mg ni ml.",
      stockUnit: "tomas",
      search: "Buscar medicamentos",
      all: "Todos",
      active: "Activos",
      paused: "Pausados",
      archived: "Archivados",
      noResults: "No encontramos medicamentos",
      archive: "Archivar tratamiento",
      archiveHint: "Se detienen los recordatorios. El historial se conserva.",
      reason: "Elegí un motivo",
      archivedSuccess: "Tratamiento archivado",
      restored: "Tratamiento restaurado",
      pausedSuccess: "Recordatorios pausados",
      activeSuccess: "Recordatorios reactivados",
      operationError:
        "No pudimos completar la acción. Revisá el estado actual y volvé a intentar.",
      notificationsPending:
        "Tratamiento guardado. No pudimos programar algunos recordatorios. Revisá los permisos y reintentá desde Ajustes.",
      checkUnavailable:
        "Tratamiento guardado. No pudimos completar la comprobación de ingredientes.",
      observations: "Revisá estas observaciones",
      saveAnyway: "Guardar tratamiento igual",
      reviewEdit: "Revisar tratamiento",
      checkUnknown:
        "No pudimos comprobar los ingredientes de este nombre. Esta función no comprueba interacciones entre medicamentos.",
      scanReview:
        "Encontramos el envase. Revisá el nombre e ingresá la cantidad que tomás; escanear no verifica tu dosis.",
      taking: "Registrando…",
      registered: "Registrada",
      registeredWarning:
        "La dosis quedó registrada. No pudimos actualizar algunos recordatorios. Revisá el estado antes de volver a intentar.",
      closeReminder: "Cerrar recordatorio",
      closeHint:
        "Cierra este recordatorio sin cambiar el registro de la dosis.",
      recordTaken: "Registrar tomada",
      originalTime: "Original: {{time}}",
      timePast: "Elegí un horario futuro de hoy.",
      tomorrow: "Mañana",
      prnLast: "Última toma registrada: {{time}}",
      intervalHint:
        "Próximo recordatorio según el intervalo que configuraste: {{time}}.",
      missing: "Este medicamento ya no está disponible.",
      retry: "Reintentar",
      daily: "Todos los días",
      schedule: "{{days}} · {{time}}",
      regimenAnchor:
        "Se cuenta desde el {{date}}. Revisá los próximos recordatorios más abajo.",
      monthShort: "En meses más cortos se usa el último día del mes.",
    },
  },
  pt: {
    uxMedication: {
      identity: "Medicamento",
      plan: "Esquema",
      review: "Revisar tratamento",
      edit: "Editar tratamento",
      manage: "Gerenciar",
      deleteHint:
        "Excluir {{name}}? Os lembretes param e o tratamento deixa de aparecer no histórico e nos relatórios. Para manter o histórico, arquive o tratamento.",
      limitMax:
        "Você registrou {{count}} doses hoje; o limite diário configurado é {{max}}.",
      limitSoon:
        "Conforme o intervalo configurado, o próximo horário é {{time}}. Isto não é uma recomendação para tomar uma dose.",
      reviewHint:
        "Confira a pessoa, a quantidade e os próximos lembretes antes de salvar.",
      step: "Etapa {{current}} de {{total}}",
      optional: "Notas, estoque e receita",
      appearance: "Foto e cor",
      save: "Salvar tratamento",
      saved: "Tratamento salvo",
      cancelChanges: "Descartar alterações?",
      discardHint: "Suas alterações ainda não foram salvas.",
      keepEditing: "Continuar editando",
      discard: "Descartar",
      invalidNumber:
        "Digite um número válido positivo (inteiro para contagens; estoque aceita zero).",
      dateRequired: "Escolha a data desta dose.",
      duplicateSchedule:
        "Dois lembretes coincidem no mesmo horário. Altere ou remova um.",
      onceHint:
        "Uma dose na data escolhida. Ao salvar, os horários adicionais serão removidos.",
      once: "Uma dose",
      repeat: "Repetir",
      prn: "Quando necessário",
      alarms: "Horários dos lembretes",
      advanced: "Esquema avançado",
      starts: "A partir de {{date}}",
      ends: "Até {{date}}",
      noEnd: "Sem data final",
      nextDates: "Próximos lembretes",
      noUpcoming: "Sem lembretes nos próximos 62 dias. Confira as datas.",
      stockLabel: "Doses disponíveis",
      stockHint:
        "Cada dose registrada desconta uma dose disponível. Esta contagem não representa comprimidos, mg ou ml.",
      stockUnit: "doses",
      search: "Buscar medicamentos",
      all: "Todos",
      active: "Ativos",
      paused: "Pausados",
      archived: "Arquivados",
      noResults: "Nenhum medicamento encontrado",
      archive: "Arquivar tratamento",
      archiveHint: "Os lembretes param. O histórico é mantido.",
      reason: "Escolha um motivo",
      archivedSuccess: "Tratamento arquivado",
      restored: "Tratamento restaurado",
      pausedSuccess: "Lembretes pausados",
      activeSuccess: "Lembretes reativados",
      operationError:
        "Não foi possível concluir a ação. Confira o estado atual e tente novamente.",
      notificationsPending:
        "Tratamento salvo. Alguns lembretes não foram agendados. Confira as permissões e tente novamente em Ajustes.",
      checkUnavailable:
        "Tratamento salvo. A verificação de ingredientes não foi concluída.",
      observations: "Confira estas observações",
      saveAnyway: "Salvar mesmo assim",
      reviewEdit: "Revisar tratamento",
      checkUnknown:
        "Não foi possível verificar os ingredientes deste nome. Esta função não verifica interações entre medicamentos.",
      scanReview:
        "Embalagem encontrada. Confira o nome e informe a quantidade que toma; escanear não verifica a dose.",
      taking: "Registrando…",
      registered: "Registrada",
      registeredWarning:
        "A dose foi registrada. Não foi possível atualizar alguns lembretes. Confira o estado antes de tentar novamente.",
      closeReminder: "Fechar lembrete",
      closeHint: "Fecha este lembrete sem alterar o registro da dose.",
      recordTaken: "Registrar como tomada",
      originalTime: "Original: {{time}}",
      timePast: "Escolha um horário futuro de hoje.",
      tomorrow: "Amanhã",
      prnLast: "Última dose registrada: {{time}}",
      intervalHint:
        "Próximo lembrete conforme o intervalo configurado: {{time}}.",
      missing: "Este medicamento não está mais disponível.",
      retry: "Tentar novamente",
      daily: "Todos os dias",
      schedule: "{{days}} · {{time}}",
      regimenAnchor:
        "Contado a partir de {{date}}. Confira os próximos lembretes abaixo.",
      monthShort: "Em meses mais curtos, usa o último dia do mês.",
    },
  },
};
