// What each GET answers each role (state §0.298; tests/row-matrix.test.mjs, where it is run) — a line a set of roles: the
// rows of each list, the caller's (mine), another member's (theirs), nobody's (none) and an org's own; then the reads
// asked, but for the plain read of the caller's own row and of the org's settings (a condition is drizzle's own SQL, its
// values in place: the rows are the fake's, so what a condition leaves out is read here and not there); then the fields this
// role is not answered as an Admin is — left out, changed or added. Beside a request's lines, the fields of each list's first
// row as an Admin is answered it (left out where the same as the request before). Read line by line when it was written.
export const ROWS = {
    'accounts': [
        ['GET no query', [
            'Admin Manager Dispatcher: accounts=mine,theirs,none ; from accounts where org_id = \'org_a\' order by name asc',
            'User ReadOnly Nonsense: accounts=mine,none ; from accounts where org_id = \'org_a\' order by name asc',
            'Technician: accounts= ; from accounts where org_id = \'org_a\' order by name asc',
        ], {
            'accounts': 'accountOwner accountSegment accountTier address address2 annualRevenue archivedAt assignedRep assignedTerritory city country createdAt customerTypes description doNotContact fiscalYearEnd foundedYear id industry linkedInUrl mergeArchived mergedIntoId naicsCode name notes orgId ownerId parentAccountId phone sicCode state totalEmployees updatedAt verticalMarket website zip',
        }],
        ['a caller with no row here', [
            'Admin Manager Dispatcher: accounts=mine,theirs,none ; from accounts where org_id = \'org_a\' order by name asc',
            'User ReadOnly Nonsense: accounts=none ; from accounts where org_id = \'org_a\' order by name asc',
            'Technician: accounts= ; from accounts where org_id = \'org_a\' order by name asc',
        ]],
    ],
    'activities': [
        ['GET no query', [
            'Admin Manager Dispatcher: activities=mine,theirs,none ; from activities where org_id = \'org_a\' order by date asc',
            'User ReadOnly Nonsense: activities=mine,none ; from activities where org_id = \'org_a\' order by date asc',
            'Technician: activities= ; from activities where org_id = \'org_a\' order by date asc',
        ], {
            'activities': 'accountId author contactId contactIds createdAt date duration emailCc emailFrom emailMessageId emailTo id leadId notes opportunityId orgId outcome ownerId subject type updatedAt',
        }],
        ['a caller with no row here', [
            'Admin Manager Dispatcher: activities=mine,theirs,none ; from activities where org_id = \'org_a\' order by date asc',
            'User ReadOnly Nonsense: activities=none ; from activities where org_id = \'org_a\' order by date asc',
            'Technician: activities= ; from activities where org_id = \'org_a\' order by date asc',
        ]],
    ],
    'ai-models': [
        ['GET no query', [
            'Admin: {checked,reason}',
            'Manager User Dispatcher Technician ReadOnly Nonsense: 403',
        ]],
    ],
    'api-keys': [
        ['GET no query', [
            'Admin: keys=mine,theirs,none ; from api_keys where org_id = \'org_a\'',
            'Manager User Dispatcher Technician ReadOnly Nonsense: 403',
        ], {
            'keys': 'createdAt createdBy id keyPrefix lastUsedAt name revokedAt scopes',
        }],
    ],
    'audit-log': [
        ['GET no query', [
            'Admin: entries=mine,theirs,none,note ; from audit_log where org_id = \'org_a\' order by timestamp desc limit 500',
            'Manager: entries=mine,theirs,none,note ; from audit_log where org_id = \'org_a\' order by timestamp desc limit 500 ; less than an Admin: entries.detail changed',
            'User Dispatcher Technician ReadOnly Nonsense: 403',
        ], {
            'entries': 'action detail entityId entityName entityType id orgId timestamp userId userName',
        }],
    ],
    'audit-stream': [
        ['GET no query', [
            'Admin: destinations=mine,theirs,none ; from audit_stream_destinations where org_id = \'org_a\' order by created_at asc',
            'Manager User Dispatcher Technician ReadOnly Nonsense: 403',
        ], {
            'destinations': 'createdAt createdBy deliveredCount failures fmt id lastAttemptAt lastDeliveredAt lastError lastStatus name orgId paused secretHint status updatedAt url',
        }],
    ],
    'automations': [
        ['GET no query', [
            'Admin Manager: automations=mine,theirs,none ; from automations where org_id = \'org_a\' order by created_at asc',
            'User Dispatcher Technician ReadOnly Nonsense: 403',
        ], {
            'automations': 'actions active conditions createdAt createdBy id lastRunAt name orgId runCount triggerEvent updatedAt',
        }],
        ['GET ?runs=true', [
            'Admin Manager: runs=mine,theirs,none ; from automation_runs where (org_id = \'org_a\' and automation_id = \'true\') order by created_at desc limit 50',
            'User Dispatcher Technician ReadOnly Nonsense: 403',
        ], {
            'runs': 'actionsExecuted automationId automationName createdAt error id orgId status triggerEvent triggeredBy',
        }],
    ],
    'backup': [
        ['GET no query', [
            'Admin: snapshots=mine,theirs,none schedule=mine ; from backups where org_id = \'org_a\' order by created_at desc limit 30 ; from backup_schedule where org_id = \'org_a\' limit 1',
            'Manager User Dispatcher Technician ReadOnly Nonsense: 403',
        ], {
            'snapshots': 'createdAt durationLabel durationMs id recordCount sizeBytes sizeLabel status triggeredBy type',
            'schedule': 'frequency id notifyOnFailure orgId retentionDays timeUtc updatedAt',
        }],
        ['GET ?download=1', [
            'Admin: entities.opportunities=mine,theirs,none entities.accounts=mine,theirs,none entities.contacts=mine,theirs,none entities.leads=mine,theirs,none entities.tasks=mine,theirs,none entities.activities=mine,theirs,none entities.users=mine,theirs,none entities.settings=org_a entities.quotes=mine,theirs,none entities.products=mine,theirs,none entities.pipelines=mine,theirs,none {exportedAt,orgId,schema} ; from backups where (id = \'x1\' and org_id = \'org_a\') ; from opportunities where org_id = \'org_a\' ; from accounts where org_id = \'org_a\' ; from contacts where org_id = \'org_a\' ; from leads where org_id = \'org_a\' ; from tasks where org_id = \'org_a\' ; from activities where org_id = \'org_a\' ; from users where org_id = \'org_a\' ; from quotes where org_id = \'org_a\' ; from products where org_id = \'org_a\' ; from pipelines where org_id = \'org_a\'',
            'Manager User Dispatcher Technician ReadOnly Nonsense: 403',
        ], {
            'entities.opportunities': 'account accountId aiScore arr closeDateHistory closeQuarter comments contactIds contacts createdAt createdBy createdDate dealScore forecastCategory forecastedCloseDate id implementationCost lostCategory lostDate lostReason nextSteps notes opportunityName orgId ownerId painPoints pipelineId probability products salesRep site stage stageChangedDate stageHistory team territory unionized updatedAt vertical wonDate',
            'entities.accounts': 'accountOwner accountSegment accountTier address address2 annualRevenue archivedAt assignedRep assignedTerritory city country createdAt customerTypes description doNotContact fiscalYearEnd foundedYear id industry linkedInUrl mergeArchived mergedIntoId naicsCode name notes orgId ownerId parentAccountId phone sicCode state totalEmployees updatedAt verticalMarket website zip',
            'entities.contacts': 'accountId address address2 archivedAt assignedRep assignedTerritory assistantName buyerPersona city company country createdAt department directReports doNotContact email firstName homeAddress id lastName managers mergeArchived mergedIntoId middleName mobile nickName notes orgId ownerId personalEmail phone prefix state suffix title updatedAt workLocation zip',
            'entities.leads': 'assignedTo company convertedAt createdAt email estimatedARR firstName firstTouchDate id lastName leadScoreBucket leadScoreEngagement leadScoreFit notes orgId ownerId phone score scoreBreakdown scoreUpdatedAt source status title updatedAt',
            'entities.tasks': 'accountId assignedTo completed completedDate contactId contacts createdAt description dueDate dueTime id opportunityId orgId ownerId priority relatedTo reminderDate reminderTime status title type updatedAt',
            'entities.activities': 'accountId author contactId contactIds createdAt date duration emailCc emailFrom emailMessageId emailTo id leadId notes opportunityId orgId outcome ownerId subject type updatedAt',
            'entities.users': 'active clerkUserId createdAt email id name orgId profile quota role team teamJoinedAt territory updatedAt',
            'entities.settings': 'companyName extra fiscalYearStart id orgId quotaData updatedAt verticals',
            'entities.quotes': 'acceptedAt approvalNote approvalReason approvalTier approvedAt approvedBy billingContact createdAt createdBy dealDiscount id lineItems name notes oneTimeValue opportunityId orgId paymentTerms quoteNumber recurringValue sentAt status subtotal syncedToOpp taxAmount taxExempt taxRate totalValue updatedAt validUntil version',
            'entities.products': 'active category createdAt createdBy customPrice description id listPrice minPrice name orgId productType sku sortOrder taxable unit updatedAt',
            'entities.pipelines': 'createdAt id isDefault name orgId updatedAt',
        }],
    ],
    'calendar-connections': [
        ['GET no query', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: userConnections=mine,theirs,none orgConnections=mine,theirs,none {providers} ; from user_calendar_connections where (user_id = \'user_me\' and org_id = \'org_a\') ; from org_calendar_connections where org_id = \'org_a\'',
        ], {
            'userConnections': 'calendarEmail connectedAt id provider',
            'orgConnections': 'calendarEmail calendarName connectedAt connectedBy id provider',
        }],
    ],
    'calendar-events': [
        ['GET no query', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: events= {connected} ; from user_calendar_connections where (user_id = \'user_me\' and org_id = \'org_a\') (x2) ; from org_calendar_connections where org_id = \'org_a\' (x2)',
        ]],
        ['GET ?calScope=org', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: events= {connected} ; from org_calendar_connections where org_id = \'org_a\' (x2) ; from user_calendar_connections where (user_id = \'user_me\' and org_id = \'org_a\')',
        ]],
        ['GET ?calScope=user', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: events= {connected} ; from user_calendar_connections where (user_id = \'user_me\' and org_id = \'org_a\') (x2) ; from org_calendar_connections where org_id = \'org_a\'',
        ]],
    ],
    'clerk-mfa-status': [
        ['GET no query', [
            'Admin: notEnrolled= enrolledUsers= byRole= {enrolled,total} ; from users where org_id = \'org_a\'',
            'Manager User Dispatcher Technician ReadOnly Nonsense: 403',
        ]],
    ],
    'coaching-notes': [
        ['GET no query', [
            'Admin: coachingNotes=mine,theirs,none ; from coaching_notes where org_id = \'org_a\' order by created_at desc ; from settings where org_id = \'org_a\' order by updated_at desc limit 1',
            'Manager User Dispatcher Technician ReadOnly Nonsense: coachingNotes=mine ; from coaching_notes where org_id = \'org_a\' order by created_at desc ; from settings where org_id = \'org_a\' order by updated_at desc limit 1',
        ], {
            'coachingNotes': 'authorId authorName createdAt date id legacy orgId readBy recipientIds teamId text updatedAt',
        }],
        ['a caller with no row here', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: coachingNotes=',
        ], {
        }],
    ],
    'contacts': [
        ['GET no query', [
            'Admin Manager Dispatcher: contacts=mine,theirs,none ; from contacts where org_id = \'org_a\' order by last_name asc',
            'User ReadOnly Nonsense: contacts=mine,none ; from contacts where org_id = \'org_a\' order by last_name asc',
            'Technician: contacts= ; from contacts where org_id = \'org_a\' order by last_name asc',
        ], {
            'contacts': 'accountId address address2 archivedAt assignedRep assignedTerritory assistantName buyerPersona city company country createdAt department directReports doNotContact email firstName homeAddress id lastName managers mergeArchived mergedIntoId middleName mobile nickName notes orgId ownerId personalEmail phone prefix state suffix title updatedAt workLocation zip',
        }],
        ['a caller with no row here', [
            'Admin Manager Dispatcher: contacts=mine,theirs,none ; from contacts where org_id = \'org_a\' order by last_name asc',
            'User ReadOnly Nonsense: contacts=none ; from contacts where org_id = \'org_a\' order by last_name asc',
            'Technician: contacts= ; from contacts where org_id = \'org_a\' order by last_name asc',
        ]],
    ],
    'dashboard-configs': [
        ['GET no query', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: config=mine ; from dashboard_configs where (user_id = \'user_me\' and org_id = \'org_a\')',
        ], {
            'config': 'createdAt id orgId updatedAt userId widgets',
        }],
    ],
    'digest': [
        ['GET no query', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: {skipped,reason}',
        ]],
    ],
    'dispatch-customers': [
        ['GET no query', [
            'Admin Manager User Dispatcher ReadOnly: customers=mine,theirs,none ; from dispatch_customers where org_id = \'org_a\'',
            'Technician: customers=mine ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where org_id = \'org_a\' ; from dispatch_customers where org_id = \'org_a\'',
            'Nonsense: 403',
        ], {
            'customers': 'accountId agreementExpiry billingAddress billingCity billingState billingZip contactEmail contactName contactPhone createdAt creditLimit customerNumber customerType doNotService doNotServiceReason id name notes orgId paymentMethod planStartDate preferredTechId serviceAddress serviceAgreement serviceCity servicePlanId serviceState serviceZip tags taxExempt taxExemptId updatedAt',
        }],
        ['GET ?resource=locations', [
            'Admin Manager User Dispatcher ReadOnly: locations=mine,theirs,none ; from dispatch_service_locations where org_id = \'org_a\'',
            'Technician: locations=mine ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where org_id = \'org_a\' ; from dispatch_service_locations where org_id = \'org_a\'',
            'Nonsense: 403',
        ], {
            'locations': 'accessNotes address city contactOnSite contactPhone createdAt customerId floors gateCode id isDefault locationType name notes orgId squareFeet state updatedAt zip',
        }],
        ['reps may not use Dispatch', [
            'Admin Manager Dispatcher ReadOnly: customers=mine,theirs,none ; from dispatch_customers where org_id = \'org_a\'',
            'User Nonsense: 403',
            'Technician: customers=mine ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where org_id = \'org_a\' ; from dispatch_customers where org_id = \'org_a\'',
        ], {
            'customers': 'accountId agreementExpiry billingAddress billingCity billingState billingZip contactEmail contactName contactPhone createdAt creditLimit customerNumber customerType doNotService doNotServiceReason id name notes orgId paymentMethod planStartDate preferredTechId serviceAddress serviceAgreement serviceCity servicePlanId serviceState serviceZip tags taxExempt taxExemptId updatedAt',
        }],
        ['a technician with no row here', [
            'Admin Manager User Dispatcher ReadOnly: customers=mine,theirs,none ; from dispatch_customers where org_id = \'org_a\'',
            'Technician Nonsense: 403',
        ]],
        ['a customer\'s locations', [
            'Admin Manager User Dispatcher ReadOnly: locations=mine,theirs,none ; from dispatch_service_locations where (org_id = \'org_a\' and customer_id = \'dispatch_customers:mine\')',
            'Technician: locations=mine ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where org_id = \'org_a\' ; from dispatch_service_locations where (org_id = \'org_a\' and customer_id = \'dispatch_customers:mine\')',
            'Nonsense: 403',
        ], {
            'locations': 'accessNotes address city contactOnSite contactPhone createdAt customerId floors gateCode id isDefault locationType name notes orgId squareFeet state updatedAt zip',
        }],
    ],
    'dispatch-equipment': [
        ['GET no query', [
            'Admin Manager User Dispatcher ReadOnly: equipment=mine,theirs,none ; from dispatch_equipment where org_id = \'org_a\'',
            'Technician: equipment= ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where org_id = \'org_a\' ; from dispatch_equipment where org_id = \'org_a\'',
            'Nonsense: 403',
        ], {
            'equipment': 'assetTag category checkedOutAt checkedOutJobId checkedOutToId createdAt id lastCalibrationDate make model name nextCalibrationDate notes orgId purchaseDate purchasePrice serialNumber status updatedAt',
        }],
        ['reps may not use Dispatch', [
            'Admin Manager Dispatcher ReadOnly: equipment=mine,theirs,none ; from dispatch_equipment where org_id = \'org_a\'',
            'User Nonsense: 403',
            'Technician: equipment= ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where org_id = \'org_a\' ; from dispatch_equipment where org_id = \'org_a\'',
        ]],
        ['a technician with no row here', [
            'Admin Manager User Dispatcher ReadOnly: equipment=mine,theirs,none ; from dispatch_equipment where org_id = \'org_a\'',
            'Technician Nonsense: 403',
        ]],
    ],
    'dispatch-jobs': [
        ['GET no query', [
            'Admin Manager User Dispatcher ReadOnly: jobs=mine,theirs,none ; from dispatch_jobs where org_id = \'org_a\' order by created_at desc',
            'Technician: jobs=mine ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where org_id = \'org_a\' order by created_at desc',
            'Nonsense: 403',
        ], {
            'jobs': 'accountId actualEnd actualStart assignedEquipmentIds assignedTechId assignedVehicleId coTechIds completionNotes createdAt createdBy crewSize customFields customerId customerNotifications customerPoNumber customerSignature description dispatchedBy durationMinutes equipmentIds followUpJobId id invoiceAmount invoicePaidAt invoiceStatus jobNumber jobType laborCost laborHours locationId materialCost minLicense needSkills opportunityId orgId parentJobId photosCount planDueDate priority publicToken quoteId requiredVehicleType requiresFollowUp scheduledDate scheduledEnd scheduledStart servicePlanId status tags techNotes timeSlot title totalCost trade updatedAt',
        }],
        ['GET ?jobId=true', [
            'Admin Manager User Dispatcher ReadOnly: job=mine ; from dispatch_jobs where (id = \'x1\' and org_id = \'org_a\')',
            'Technician: job=mine ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where (id = \'x1\' and org_id = \'org_a\')',
            'Nonsense: 403',
        ], {
            'job': 'accountId actualEnd actualStart assignedEquipmentIds assignedTechId assignedVehicleId coTechIds completionNotes createdAt createdBy crewSize customFields customerId customerNotifications customerPoNumber customerSignature description dispatchedBy durationMinutes equipmentIds followUpJobId id invoiceAmount invoicePaidAt invoiceStatus jobNumber jobType laborCost laborHours locationId materialCost minLicense needSkills opportunityId orgId parentJobId photosCount planDueDate priority publicToken quoteId requiredVehicleType requiresFollowUp scheduledDate scheduledEnd scheduledStart servicePlanId status tags techNotes timeSlot title totalCost trade updatedAt',
        }],
        ['reps may not use Dispatch', [
            'Admin Manager Dispatcher ReadOnly: jobs=mine,theirs,none ; from dispatch_jobs where org_id = \'org_a\' order by created_at desc',
            'User Nonsense: 403',
            'Technician: jobs=mine ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where org_id = \'org_a\' order by created_at desc',
        ], {
            'jobs': 'accountId actualEnd actualStart assignedEquipmentIds assignedTechId assignedVehicleId coTechIds completionNotes createdAt createdBy crewSize customFields customerId customerNotifications customerPoNumber customerSignature description dispatchedBy durationMinutes equipmentIds followUpJobId id invoiceAmount invoicePaidAt invoiceStatus jobNumber jobType laborCost laborHours locationId materialCost minLicense needSkills opportunityId orgId parentJobId photosCount planDueDate priority publicToken quoteId requiredVehicleType requiresFollowUp scheduledDate scheduledEnd scheduledStart servicePlanId status tags techNotes timeSlot title totalCost trade updatedAt',
        }],
        ['a technician with no row here', [
            'Admin Manager User Dispatcher ReadOnly: jobs=mine,theirs,none ; from dispatch_jobs where org_id = \'org_a\' order by created_at desc',
            'Technician Nonsense: 403',
        ]],
        ['lineitems of the job mine', [
            'Admin Manager User Dispatcher ReadOnly: lineItems=mine,theirs,none ; from dispatch_job_line_items where (org_id = \'org_a\' and job_id = \'dispatch_jobs:mine\')',
            'Technician: lineItems=mine,theirs,none ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where (id = \'dispatch_jobs:mine\' and org_id = \'org_a\') ; from dispatch_job_line_items where (org_id = \'org_a\' and job_id = \'dispatch_jobs:mine\')',
            'Nonsense: 403',
        ], {
            'lineItems': 'createdAt description id itemType jobId orgId partNumber quantity sortOrder taxable totalPrice unitPrice updatedAt',
        }],
        ['history of the job mine', [
            'Admin Manager User Dispatcher ReadOnly: history=mine,theirs,none ; from dispatch_job_status_history where (org_id = \'org_a\' and job_id = \'dispatch_jobs:mine\') order by created_at desc',
            'Technician: history=mine,theirs,none ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where (id = \'dispatch_jobs:mine\' and org_id = \'org_a\') ; from dispatch_job_status_history where (org_id = \'org_a\' and job_id = \'dispatch_jobs:mine\') order by created_at desc',
            'Nonsense: 403',
        ], {
            'history': 'changedBy createdAt fromStatus id jobId note orgId toStatus',
        }],
        ['lineitems of the job theirs', [
            'Admin Manager User Dispatcher ReadOnly: lineItems=mine,theirs,none ; from dispatch_job_line_items where (org_id = \'org_a\' and job_id = \'dispatch_jobs:theirs\')',
            'Technician: 404',
            'Nonsense: 403',
        ], {
            'lineItems': 'createdAt description id itemType jobId orgId partNumber quantity sortOrder taxable totalPrice unitPrice updatedAt',
        }],
        ['history of the job theirs', [
            'Admin Manager User Dispatcher ReadOnly: history=mine,theirs,none ; from dispatch_job_status_history where (org_id = \'org_a\' and job_id = \'dispatch_jobs:theirs\') order by created_at desc',
            'Technician: 404',
            'Nonsense: 403',
        ], {
            'history': 'changedBy createdAt fromStatus id jobId note orgId toStatus',
        }],
        ['the job mine', [
            'Admin Manager User Dispatcher ReadOnly: job=mine ; from dispatch_jobs where (id = \'dispatch_jobs:mine\' and org_id = \'org_a\')',
            'Technician: job=mine ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where (id = \'dispatch_jobs:mine\' and org_id = \'org_a\')',
            'Nonsense: 403',
        ], {
            'job': 'accountId actualEnd actualStart assignedEquipmentIds assignedTechId assignedVehicleId coTechIds completionNotes createdAt createdBy crewSize customFields customerId customerNotifications customerPoNumber customerSignature description dispatchedBy durationMinutes equipmentIds followUpJobId id invoiceAmount invoicePaidAt invoiceStatus jobNumber jobType laborCost laborHours locationId materialCost minLicense needSkills opportunityId orgId parentJobId photosCount planDueDate priority publicToken quoteId requiredVehicleType requiresFollowUp scheduledDate scheduledEnd scheduledStart servicePlanId status tags techNotes timeSlot title totalCost trade updatedAt',
        }],
        ['the job theirs', [
            'Admin Manager User Dispatcher ReadOnly: job=theirs ; from dispatch_jobs where (id = \'dispatch_jobs:theirs\' and org_id = \'org_a\')',
            'Technician: 404',
            'Nonsense: 403',
        ]],
    ],
    'dispatch-plan-visits': [
        ['GET no query', [
            'Admin Manager User Dispatcher ReadOnly: visits=mine,theirs,none ; from dispatch_plan_visits where org_id = \'org_a\'',
            'Technician: visits=mine ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where org_id = \'org_a\' ; from dispatch_plan_visits where org_id = \'org_a\'',
            'Nonsense: 403',
        ], {
            'visits': 'action byName byUserId createdAt customerId deferredTo dueDate id orgId planId reason',
        }],
        ['GET ?customerId=true', [
            'Admin Manager User Dispatcher ReadOnly: visits=mine,theirs,none ; from dispatch_plan_visits where (org_id = \'org_a\' and customer_id = \'true\')',
            'Technician: visits=mine ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where org_id = \'org_a\' ; from dispatch_plan_visits where (org_id = \'org_a\' and customer_id = \'true\')',
            'Nonsense: 403',
        ]],
        ['reps may not use Dispatch', [
            'Admin Manager Dispatcher ReadOnly: visits=mine,theirs,none ; from dispatch_plan_visits where org_id = \'org_a\'',
            'User Nonsense: 403',
            'Technician: visits=mine ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where org_id = \'org_a\' ; from dispatch_plan_visits where org_id = \'org_a\'',
        ]],
        ['a technician with no row here', [
            'Admin Manager User Dispatcher ReadOnly: visits=mine,theirs,none ; from dispatch_plan_visits where org_id = \'org_a\'',
            'Technician Nonsense: 403',
        ]],
    ],
    'dispatch-schedule-blocks': [
        ['GET no query', [
            'Admin Manager User Dispatcher ReadOnly: blocks=mine,theirs,none ; from dispatch_schedule_blocks where org_id = \'org_a\'',
            'Technician: blocks=mine,theirs,none ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_schedule_blocks where (org_id = \'org_a\' and tech_id = \'dispatch_technicians:mine\')',
            'Nonsense: 403',
        ], {
            'blocks': 'allDay blockType createdAt createdBy endDate endTime id notes orgId startDate startTime techId title updatedAt',
        }],
        ['GET ?from=true', [
            'Admin Manager User Dispatcher ReadOnly: blocks=mine,theirs,none ; from dispatch_schedule_blocks where (org_id = \'org_a\' and end_date >= \'true\')',
            'Technician: blocks=mine,theirs,none ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_schedule_blocks where (org_id = \'org_a\' and tech_id = \'dispatch_technicians:mine\' and end_date >= \'true\')',
            'Nonsense: 403',
        ]],
        ['GET ?techId=true', [
            'Admin Manager User Dispatcher ReadOnly: blocks=mine,theirs,none ; from dispatch_schedule_blocks where (org_id = \'org_a\' and tech_id = \'true\')',
            'Technician: blocks=mine,theirs,none ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_schedule_blocks where (org_id = \'org_a\' and tech_id = \'dispatch_technicians:mine\' and tech_id = \'true\')',
            'Nonsense: 403',
        ]],
        ['GET ?to=true', [
            'Admin Manager User Dispatcher ReadOnly: blocks=mine,theirs,none ; from dispatch_schedule_blocks where (org_id = \'org_a\' and start_date <= \'true\')',
            'Technician: blocks=mine,theirs,none ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_schedule_blocks where (org_id = \'org_a\' and tech_id = \'dispatch_technicians:mine\' and start_date <= \'true\')',
            'Nonsense: 403',
        ]],
        ['reps may not use Dispatch', [
            'Admin Manager Dispatcher ReadOnly: blocks=mine,theirs,none ; from dispatch_schedule_blocks where org_id = \'org_a\'',
            'User Nonsense: 403',
            'Technician: blocks=mine,theirs,none ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_schedule_blocks where (org_id = \'org_a\' and tech_id = \'dispatch_technicians:mine\')',
        ]],
        ['a technician with no row here', [
            'Admin Manager User Dispatcher ReadOnly: blocks=mine,theirs,none ; from dispatch_schedule_blocks where org_id = \'org_a\'',
            'Technician Nonsense: 403',
        ]],
    ],
    'dispatch-service-plans': [
        ['GET no query', [
            'Admin Manager User Dispatcher ReadOnly: plans=mine,theirs,none ; from dispatch_service_plans where org_id = \'org_a\'',
            'Technician: plans=mine ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where org_id = \'org_a\' ; from dispatch_service_plans where org_id = \'org_a\'',
            'Nonsense: 403',
        ], {
            'plans': 'active anchorMode billingPeriod cadence coveredJobTypes createdAt description discountPercent id includedHours intervalDays leadDays name notes orgId price renewalLeadDays responseHours updatedAt visitTemplateId visitsPerYear',
        }],
        ['reps may not use Dispatch', [
            'Admin Manager Dispatcher ReadOnly: plans=mine,theirs,none ; from dispatch_service_plans where org_id = \'org_a\'',
            'User Nonsense: 403',
            'Technician: plans=mine ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where org_id = \'org_a\' ; from dispatch_service_plans where org_id = \'org_a\'',
        ]],
        ['a technician with no row here', [
            'Admin Manager User Dispatcher ReadOnly: plans=mine,theirs,none ; from dispatch_service_plans where org_id = \'org_a\'',
            'Technician Nonsense: 403',
        ]],
    ],
    'dispatch-status': [
        ['the customer\'s page', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense:  ; from dispatch_jobs where public_token = \'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\' ; from dispatch_customers where (id = \'dispatch_customers:mine\' and org_id = \'org_a\') ; from dispatch_technicians where (id = \'dispatch_technicians:mine\' and org_id = \'org_a\')',
        ]],
    ],
    'dispatch-technicians': [
        ['GET no query', [
            'Admin Manager User Dispatcher ReadOnly: technicians=mine,theirs,none ; from dispatch_technicians where org_id = \'org_a\' ; from users where (org_id = \'org_a\' and clerk_user_id in (\'user_me\', \'user_other\'))',
            'Technician: technicians=mine,theirs,none ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from users where (org_id = \'org_a\' and clerk_user_id in (\'user_me\', \'user_other\'))',
            'Nonsense: 403',
        ], {
            'technicians': 'assignedVehicleId avatarInitials certifications createdAt email employmentType firstName homeZip id laborRate lastName licenseLevel memberId notes orgId overtimeRate phone serviceZones skills status updatedAt userId workingHours',
        }],
        ['reps may not use Dispatch', [
            'Admin Manager Dispatcher ReadOnly: technicians=mine,theirs,none ; from dispatch_technicians where org_id = \'org_a\' ; from users where (org_id = \'org_a\' and clerk_user_id in (\'user_me\', \'user_other\'))',
            'User Nonsense: 403',
            'Technician: technicians=mine,theirs,none ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from users where (org_id = \'org_a\' and clerk_user_id in (\'user_me\', \'user_other\'))',
        ]],
        ['a technician with no row here', [
            'Admin Manager User Dispatcher ReadOnly: technicians= ; from dispatch_technicians where org_id = \'org_a\'',
            'Technician: technicians= ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\')',
            'Nonsense: 403',
        ], {
        }],
    ],
    'dispatch-vehicles': [
        ['GET no query', [
            'Admin Manager User Dispatcher ReadOnly: vehicles=mine,theirs,none ; from dispatch_vehicles where org_id = \'org_a\'',
            'Technician: vehicles=mine ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where org_id = \'org_a\' ; from dispatch_vehicles where org_id = \'org_a\'',
            'Nonsense: 403',
        ], {
            'vehicles': 'assignedTechId color createdAt fuelType gpsTrackerUrl id insuranceExpiry lastServiceDate licensePlate make model name nextServiceMiles notes odometer orgId registrationExpiry status type updatedAt vin year',
        }],
        ['reps may not use Dispatch', [
            'Admin Manager Dispatcher ReadOnly: vehicles=mine,theirs,none ; from dispatch_vehicles where org_id = \'org_a\'',
            'User Nonsense: 403',
            'Technician: vehicles=mine ; from dispatch_technicians where (org_id = \'org_a\' and user_id = \'user_me\') ; from dispatch_jobs where org_id = \'org_a\' ; from dispatch_vehicles where org_id = \'org_a\'',
        ]],
        ['a technician with no row here', [
            'Admin Manager User Dispatcher ReadOnly: vehicles=mine,theirs,none ; from dispatch_vehicles where org_id = \'org_a\'',
            'Technician Nonsense: 403',
        ]],
    ],
    'documents': [
        ['GET no query', [
            'Admin: documents=mine,none documents.links=mine,none ; from documents where org_id = \'org_a\' order by modified_at desc ; from document_links where (org_id = \'org_a\' and document_id in (\'documents:mine\', \'documents:none\'))',
            'Manager User Dispatcher Technician ReadOnly Nonsense: documents=mine,none documents.links=mine,none ; from documents where org_id = \'org_a\' order by modified_at desc ; from document_links where (org_id = \'org_a\' and document_id in (\'documents:mine\', \'documents:none\')) ; less than an Admin: documents.canManage changed',
        ], {
            'documents': 'canManage category contentType createdAt ext id links modifiedAt name note orgId ownerId ownerName sizeKb storageKey updatedAt uploadedAt version visibility visibilityKind visibilityUserIds',
            'documents.links': 'id name recordId sub type',
        }],
        ['GET ?action=download', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: {url,expiresIn} ; from documents where (id = \'x1\' and org_id = \'org_a\')',
        ], {
        }],
        ['GET ?action=versions', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: versions=mine,theirs,none ; from documents where (id = \'x1\' and org_id = \'org_a\') ; from document_versions where (org_id = \'org_a\' and document_id = \'x1\') order by v desc',
        ], {
            'versions': 'byId byName contentType createdAt documentId id note orgId sizeKb storageKey v',
        }],
        ['GET ?linkedTo=true', [
            'Admin: documents=mine,none documents.links=mine,none ; from document_links where (org_id = \'org_a\' and record_id = \'true\') ; from documents where (org_id = \'org_a\' and id in (\'documents:mine\', \'documents:theirs\', \'documents:none\')) ; from document_links where (org_id = \'org_a\' and document_id in (\'documents:mine\', \'documents:none\'))',
            'Manager User Dispatcher Technician ReadOnly Nonsense: documents=mine,none documents.links=mine,none ; from document_links where (org_id = \'org_a\' and record_id = \'true\') ; from documents where (org_id = \'org_a\' and id in (\'documents:mine\', \'documents:theirs\', \'documents:none\')) ; from document_links where (org_id = \'org_a\' and document_id in (\'documents:mine\', \'documents:none\')) ; less than an Admin: documents.canManage changed',
        ], {
            'documents': 'canManage category contentType createdAt ext id links modifiedAt name note orgId ownerId ownerName sizeKb storageKey updatedAt uploadedAt version visibility visibilityKind visibilityUserIds',
            'documents.links': 'id name recordId sub type',
        }],
        ['a version of a document', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: {url,expiresIn} ; from documents where (id = \'documents:mine\' and org_id = \'org_a\') ; from document_versions where (org_id = \'org_a\' and document_id = \'documents:mine\' and v = 1)',
        ], {
        }],
        ['download of the document none', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: {url,expiresIn} ; from documents where (id = \'documents:none\' and org_id = \'org_a\')',
        ]],
        ['versions of the document none', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: versions=mine,theirs,none ; from documents where (id = \'documents:none\' and org_id = \'org_a\') ; from document_versions where (org_id = \'org_a\' and document_id = \'documents:none\') order by v desc',
        ], {
            'versions': 'byId byName contentType createdAt documentId id note orgId sizeKb storageKey v',
        }],
        ['a kind of record and its id', [
            'Admin: documents=mine,none documents.links=mine,none ; from document_links where (org_id = \'org_a\' and record_type = \'account\' and record_id = \'accounts:mine\') ; from documents where (org_id = \'org_a\' and id in (\'documents:mine\', \'documents:theirs\', \'documents:none\')) ; from document_links where (org_id = \'org_a\' and document_id in (\'documents:mine\', \'documents:none\'))',
            'Manager User Dispatcher Technician ReadOnly Nonsense: documents=mine,none documents.links=mine,none ; from document_links where (org_id = \'org_a\' and record_type = \'account\' and record_id = \'accounts:mine\') ; from documents where (org_id = \'org_a\' and id in (\'documents:mine\', \'documents:theirs\', \'documents:none\')) ; from document_links where (org_id = \'org_a\' and document_id in (\'documents:mine\', \'documents:none\')) ; less than an Admin: documents.canManage changed',
        ], {
            'documents': 'canManage category contentType createdAt ext id links modifiedAt name note orgId ownerId ownerName sizeKb storageKey updatedAt uploadedAt version visibility visibilityKind visibilityUserIds',
            'documents.links': 'id name recordId sub type',
        }],
    ],
    'duplicates': [
        ['GET no query', [
            'Admin Manager: pairs= {tier,counts,scanned,truncated} ; from accounts where org_id = \'org_a\'',
            'User Dispatcher Technician ReadOnly Nonsense: 403',
        ]],
        ['GET ?entityType=contact', [
            'Admin Manager: pairs.a=mine,mine,theirs pairs.b=theirs,none,none {tier,counts,scanned,truncated} ; from contacts where org_id = \'org_a\'',
            'User Dispatcher Technician ReadOnly Nonsense: 403',
        ], {
            'pairs.a': 'assignedRep city company createdAt email firstName id lastName mobile name phone state title updatedAt',
            'pairs.b': 'assignedRep city company createdAt email firstName id lastName mobile name phone state title updatedAt',
        }],
        ['GET ?mode=create', [
            'Admin Manager User Dispatcher ReadOnly Nonsense: duplicates= related= ; from accounts where org_id = \'org_a\'',
            'Technician: 403',
        ], {
        }],
        ['a contact typed', [
            'Admin Manager Dispatcher: duplicates= related=theirs ; from contacts where org_id = \'org_a\'',
            'User ReadOnly Nonsense: duplicates= related= ; from contacts where org_id = \'org_a\'',
            'Technician: 403',
        ], {
            'related': 'assignedRep city company createdAt email firstName id lastName mobile name phone reasons relationship score state title updatedAt',
        }],
        ['an account typed', [
            'Admin Manager Dispatcher: duplicates=theirs related= ; from accounts where org_id = \'org_a\'',
            'User ReadOnly Nonsense: duplicates= related= ; from accounts where org_id = \'org_a\'',
            'Technician: 403',
        ], {
            'duplicates': 'accountOwner accountTier assignedRep city createdAt id industry name parentAccountId phone reasons relationship score state updatedAt website',
        }],
    ],
    'email-inbound': [
        ['GET no query', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: {address,myAddress,configured}',
        ]],
    ],
    'export-dsr': [
        ['GET no query', [
            'Admin: dsrQueue=mine,theirs,none ; from dsr_queue where org_id = \'org_a\' order by created_at desc',
            'Manager User Dispatcher Technician ReadOnly Nonsense: 403',
        ], {
            'dsrQueue': 'completedAt createdAt createdBy id notes orgId slaDeadline slaLabel status subject type updatedAt',
        }],
    ],
    'export-runs': [
        ['GET no query', [
            'Admin: runs=mine,theirs,none ; from export_runs where org_id = \'org_a\' order by created_at desc limit 20',
            'Manager User Dispatcher Technician ReadOnly Nonsense: 403',
        ], {
            'runs': 'createdAt durationMs errorMsg format id name orgId rowCount scheduleId scope sizeBytes status triggeredBy',
        }],
    ],
    'export-schedules': [
        ['GET no query', [
            'Admin: schedules=mine,theirs,none ; from export_schedules where org_id = \'org_a\' order by created_at desc',
            'Manager User Dispatcher Technician ReadOnly Nonsense: 403',
        ], {
            'schedules': 'cadence createdAt createdBy destination enabled format id lastError lastRunAt lastSize name orgId scope status updatedAt',
        }],
    ],
    'invoices': [
        ['GET no query', [
            'Admin Manager User Dispatcher ReadOnly: invoices=mine,theirs,none ; from invoices where org_id = \'org_a\' order by created_at desc',
            'Technician Nonsense: 403',
        ], {
            'invoices': 'accountId amountPaid createdAt createdBy customerId customerPoNumber dueDate id invoiceNumber issueDate issuedAt jobId lineItems notes opportunityId orgId paidAt paymentTerms quickbooksId quickbooksRealmId quickbooksSyncError quickbooksSyncedAt quoteId status subtotal taxAmount taxRate total updatedAt voidedAt',
        }],
        ['GET ?jobId=true', [
            'Admin Manager User Dispatcher ReadOnly: invoice=mine ; from invoices where (id = \'x1\' and org_id = \'org_a\')',
            'Technician Nonsense: 403',
        ], {
            'invoice': 'accountId amountPaid createdAt createdBy customerId customerPoNumber dueDate id invoiceNumber issueDate issuedAt jobId lineItems notes opportunityId orgId paidAt paymentTerms quickbooksId quickbooksRealmId quickbooksSyncError quickbooksSyncedAt quoteId status subtotal taxAmount taxRate total updatedAt voidedAt',
        }],
        ['reps may not use Dispatch', [
            'Admin Manager Dispatcher ReadOnly: invoices=mine,theirs,none ; from invoices where org_id = \'org_a\' order by created_at desc',
            'User Technician Nonsense: 403',
        ], {
            'invoices': 'accountId amountPaid createdAt createdBy customerId customerPoNumber dueDate id invoiceNumber issueDate issuedAt jobId lineItems notes opportunityId orgId paidAt paymentTerms quickbooksId quickbooksRealmId quickbooksSyncError quickbooksSyncedAt quoteId status subtotal taxAmount taxRate total updatedAt voidedAt',
        }],
        ['of a job', [
            'Admin Manager User Dispatcher ReadOnly: invoices=mine,theirs,none ; from invoices where (org_id = \'org_a\' and job_id = \'dispatch_jobs:mine\') order by created_at desc',
            'Technician Nonsense: 403',
        ]],
    ],
    'job-status': [
        ['GET no query', [
            'Admin: {now,site,enabled,jobs} ; from site_job_heartbeats where site = \'local\'',
            'Manager User Dispatcher Technician ReadOnly Nonsense: 403',
        ]],
    ],
    'lead-requests': [
        ['GET no query', [
            'Admin Manager: leadRequests=mine,theirs,none ; from lead_claim_requests where org_id = \'org_a\' order by created_at desc',
            'User Dispatcher Technician ReadOnly Nonsense: leadRequests=mine ; from lead_claim_requests where org_id = \'org_a\' order by created_at desc',
        ], {
            'leadRequests': 'createdAt id leadId note orgId requesterId resolvedAt resolvedBy status updatedAt',
        }],
        ['a caller with no row here', [
            'Admin Manager: leadRequests=mine,theirs,none ; from lead_claim_requests where org_id = \'org_a\' order by created_at desc',
            'User Dispatcher Technician ReadOnly Nonsense: leadRequests= ; from lead_claim_requests where org_id = \'org_a\' order by created_at desc',
        ]],
    ],
    'leads': [
        ['GET no query', [
            'Admin Manager Dispatcher: leads=mine,theirs,none ; from leads where org_id = \'org_a\' order by created_at asc',
            'User ReadOnly Nonsense: leads=mine,none ; from leads where org_id = \'org_a\' order by created_at asc',
            'Technician: leads= ; from leads where org_id = \'org_a\' order by created_at asc',
        ], {
            'leads': 'assignedTo company convertedAt createdAt email estimatedARR firstName firstTouchDate id lastName leadScoreBucket leadScoreEngagement leadScoreFit notes orgId ownerId phone score scoreBreakdown scoreUpdatedAt source status title updatedAt',
        }],
        ['unassigned leads hidden from reps', [
            'Admin Manager Dispatcher: leads=mine,theirs,none ; from leads where org_id = \'org_a\' order by created_at asc',
            'User ReadOnly Nonsense: leads=mine ; from leads where org_id = \'org_a\' order by created_at asc',
            'Technician: leads= ; from leads where org_id = \'org_a\' order by created_at asc',
        ]],
        ['a caller with no row here', [
            'Admin Manager Dispatcher: leads=mine,theirs,none ; from leads where org_id = \'org_a\' order by created_at asc',
            'User ReadOnly Nonsense: leads=none ; from leads where org_id = \'org_a\' order by created_at asc',
            'Technician: leads= ; from leads where org_id = \'org_a\' order by created_at asc',
        ]],
    ],
    'merge': [
        ['GET no query', [
            'Admin Manager: merges=mine,theirs,none {more} ; from merge_log where (org_id = \'org_a\' and entity_type = \'account\') order by created_at desc limit 51 ; from accounts where (org_id = \'org_a\' and id in (\'survivorId\', \'archivedId\')) ; from merge_log where (org_id = \'org_a\' and id in (\'merge_log:mine\', \'merge_log:theirs\', \'merge_log:none\'))',
            'User Dispatcher Technician ReadOnly Nonsense: 403',
        ], {
            'merges': 'archivedId archivedName by createdAt id refusal reversedAt status survivorId survivorName',
        }],
        ['GET ?entityType=contact', [
            'Admin Manager: merges=mine,theirs,none {more} ; from merge_log where (org_id = \'org_a\' and entity_type = \'contact\') order by created_at desc limit 51 ; from contacts where (org_id = \'org_a\' and id in (\'survivorId\', \'archivedId\')) ; from merge_log where (org_id = \'org_a\' and id in (\'merge_log:mine\', \'merge_log:theirs\', \'merge_log:none\'))',
            'User Dispatcher Technician ReadOnly Nonsense: 403',
        ]],
    ],
    'opportunities': [
        ['GET no query', [
            'Admin Manager Dispatcher: opportunities=mine,theirs,none ; from opportunities where org_id = \'org_a\' order by created_at asc',
            'User ReadOnly Nonsense: opportunities=mine ; from opportunities where org_id = \'org_a\' order by created_at asc',
            'Technician: opportunities= ; from opportunities where org_id = \'org_a\' order by created_at asc',
        ], {
            'opportunities': 'account accountId aiScore arr closeDateHistory closeQuarter comments contactIds contacts createdAt createdBy createdDate dealScore forecastCategory forecastedCloseDate id implementationCost lostCategory lostDate lostReason nextSteps notes opportunityName orgId ownerId painPoints pipelineId probability products salesRep site stage stageChangedDate stageHistory team territory unionized updatedAt vertical wonDate',
        }],
        ['a Manager who manages Other Rep', [
            'Admin Dispatcher: opportunities=mine,theirs,none ; from opportunities where org_id = \'org_a\' order by created_at asc',
            'Manager: opportunities=theirs,none ; from opportunities where org_id = \'org_a\' order by created_at asc',
            'User ReadOnly Nonsense: opportunities=mine ; from opportunities where org_id = \'org_a\' order by created_at asc',
            'Technician: opportunities= ; from opportunities where org_id = \'org_a\' order by created_at asc',
        ]],
        ['unassigned deals shown to reps', [
            'Admin Manager Dispatcher: opportunities=mine,theirs,none ; from opportunities where org_id = \'org_a\' order by created_at asc',
            'User ReadOnly Nonsense: opportunities=mine,none ; from opportunities where org_id = \'org_a\' order by created_at asc',
            'Technician: opportunities= ; from opportunities where org_id = \'org_a\' order by created_at asc',
        ]],
        ['a caller with no row here', [
            'Admin Manager Dispatcher: opportunities=mine,theirs,none ; from opportunities where org_id = \'org_a\' order by created_at asc',
            'User Technician ReadOnly Nonsense: opportunities= ; from opportunities where org_id = \'org_a\' order by created_at asc',
        ]],
    ],
    'pipeline-alerts': [
        ['GET no query', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: {skipped,reason}',
        ]],
    ],
    'products': [
        ['GET no query', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: products=mine,theirs,none ; from products where (org_id = \'org_a\' and active = true) order by sort_order asc, name asc',
        ], {
            'products': 'active category createdAt createdBy customPrice description id listPrice minPrice name orgId productType sku sortOrder taxable unit updatedAt',
        }],
        ['GET ?includeInactive=true', [
            'Admin: products=mine,theirs,none ; from products where org_id = \'org_a\' order by sort_order asc, name asc',
            'Manager User Dispatcher Technician ReadOnly Nonsense: products=mine,theirs,none ; from products where (org_id = \'org_a\' and active = true) order by sort_order asc, name asc',
        ]],
    ],
    'public-api': [
        ['an API key: opportunities', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: data=mine,theirs,none {meta} ; from api_keys where key_hash = \'3eeb9c6af45f1291d5284c826843cf9abdd9e53c0e6544b4180d7d89b0094153\' ; from opportunities where org_id = \'org_a\' ; from opportunities where org_id = \'org_a\' order by created_at desc, id desc limit 50',
        ], {
            'data': 'account ai_score arr close_quarter created_at created_date forecast_category forecasted_close_date id implementation_cost lost_category lost_date lost_reason next_steps notes opportunity_name pipeline_id probability products sales_rep site stage stage_changed_date team territory updated_at vertical win_chance won_date',
        }],
        ['an API key: accounts', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: data=mine,theirs,none {meta} ; from api_keys where key_hash = \'3eeb9c6af45f1291d5284c826843cf9abdd9e53c0e6544b4180d7d89b0094153\' ; from accounts where (org_id = \'org_a\' and merge_archived is not true) ; from accounts where (org_id = \'org_a\' and merge_archived is not true) order by created_at desc, id desc limit 50',
        ], {
            'data': 'account_owner account_tier address assigned_rep assigned_territory city country created_at id industry name notes parent_account_id phone state updated_at vertical_market website zip',
        }],
        ['an API key: contacts', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: data=mine,theirs,none {meta} ; from api_keys where key_hash = \'3eeb9c6af45f1291d5284c826843cf9abdd9e53c0e6544b4180d7d89b0094153\' ; from contacts where (org_id = \'org_a\' and merge_archived is not true) ; from contacts where (org_id = \'org_a\' and merge_archived is not true) order by created_at desc, id desc limit 50',
        ], {
            'data': 'assigned_rep assigned_territory city company country created_at department email first_name full_name id last_name mobile notes phone state title updated_at',
        }],
        ['an API key: activities', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: data=mine,theirs,none {meta} ; from api_keys where key_hash = \'3eeb9c6af45f1291d5284c826843cf9abdd9e53c0e6544b4180d7d89b0094153\' ; from activities where org_id = \'org_a\' ; from activities where org_id = \'org_a\' order by created_at desc, id desc limit 50',
        ], {
            'data': 'account_id contact_id created_at date duration_minutes id lead_id notes opportunity_id outcome rep subject type updated_at',
        }],
        ['an API key: leads', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: data=mine,theirs,none {meta} ; from api_keys where key_hash = \'3eeb9c6af45f1291d5284c826843cf9abdd9e53c0e6544b4180d7d89b0094153\' ; from leads where org_id = \'org_a\' ; from leads where org_id = \'org_a\' order by created_at desc, id desc limit 50',
        ], {
            'data': 'assigned_to company converted_at created_at email estimated_arr first_name full_name id last_name phone score source status title updated_at',
        }],
        ['an API key: tasks', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: data=mine,theirs,none {meta} ; from api_keys where key_hash = \'3eeb9c6af45f1291d5284c826843cf9abdd9e53c0e6544b4180d7d89b0094153\' ; from tasks where org_id = \'org_a\' ; from tasks where org_id = \'org_a\' order by created_at desc, id desc limit 50',
        ], {
            'data': 'account_id assigned_to completed_date contact_id created_at description due_date due_time id opportunity_id priority status title type updated_at',
        }],
    ],
    'quote-reminders': [
        ['GET no query', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: {skipped,reason}',
        ]],
    ],
    'quote-to-job': [
        ['GET ?quoteId=true', [
            'Admin Manager User Dispatcher ReadOnly Nonsense: job=mine job.invoice=mine ; from quotes where (id = \'true\' and org_id = \'org_a\') limit 1 ; from opportunities where (id = \'opportunities:mine\' and org_id = \'org_a\') limit 1 ; from dispatch_jobs where (org_id = \'org_a\' and quote_id = \'true\') order by created_at desc limit 1 ; from invoices where (org_id = \'org_a\' and job_id = \'dispatch_jobs:mine\') order by created_at desc limit 1',
            'Technician: 403',
        ], {
            'job': 'id invoice jobNumber scheduledDate status',
            'job.invoice': 'id invoiceNumber status total',
        }],
        ['the job of the quote mine', [
            'Admin Manager User Dispatcher ReadOnly Nonsense: job=mine job.invoice=mine ; from quotes where (id = \'quotes:mine\' and org_id = \'org_a\') limit 1 ; from opportunities where (id = \'opportunities:mine\' and org_id = \'org_a\') limit 1 ; from dispatch_jobs where (org_id = \'org_a\' and quote_id = \'quotes:mine\') order by created_at desc limit 1 ; from invoices where (org_id = \'org_a\' and job_id = \'dispatch_jobs:mine\') order by created_at desc limit 1',
            'Technician: 403',
        ]],
        ['the job of the quote theirs', [
            'Admin Manager Dispatcher: job=mine job.invoice=mine ; from quotes where (id = \'quotes:theirs\' and org_id = \'org_a\') limit 1 ; from opportunities where (id = \'opportunities:theirs\' and org_id = \'org_a\') limit 1 ; from dispatch_jobs where (org_id = \'org_a\' and quote_id = \'quotes:theirs\') order by created_at desc limit 1 ; from invoices where (org_id = \'org_a\' and job_id = \'dispatch_jobs:mine\') order by created_at desc limit 1',
            'User ReadOnly Nonsense: 404',
            'Technician: 403',
        ]],
    ],
    'quotes': [
        ['GET no query', [
            'Admin Manager Dispatcher: quotes=mine,theirs,none ; from opportunities where org_id = \'org_a\' ; from quotes where org_id = \'org_a\' order by created_at desc',
            'User ReadOnly Nonsense: quotes=mine ; from opportunities where org_id = \'org_a\' ; from quotes where org_id = \'org_a\' order by created_at desc',
            'Technician: quotes= ; from opportunities where org_id = \'org_a\' ; from quotes where org_id = \'org_a\' order by created_at desc',
        ], {
            'quotes': 'acceptedAt approvalNote approvalReason approvalTier approvedAt approvedBy billingContact createdAt createdBy dealDiscount id lineItems name notes oneTimeValue opportunityId orgId paymentTerms quoteNumber recurringValue sentAt status subtotal syncedToOpp taxAmount taxExempt taxRate totalValue updatedAt validUntil version',
        }],
        ['GET ?activity=true', [
            'Admin Manager User Dispatcher ReadOnly Nonsense: {events,days} ; from opportunities where org_id = \'org_a\' ; from quotes where org_id = \'org_a\' ; from audit_log where (org_id = \'org_a\' and entity_type = \'quote\' and action in (\'quote.submitted\', \'quote.approved\', \'quote.sentback\', \'quote.withdrawn\') and timestamp >= \'a time\') order by timestamp desc limit 5000',
            'Technician: events= {days} ; from opportunities where org_id = \'org_a\' ; from quotes where org_id = \'org_a\' ; from audit_log where (org_id = \'org_a\' and entity_type = \'quote\' and action in (\'quote.submitted\', \'quote.approved\', \'quote.sentback\', \'quote.withdrawn\') and timestamp >= \'a time\') order by timestamp desc limit 5000',
        ], {
        }],
        ['GET ?approvalStats=true', [
            'Admin Manager: {approvalStats} ; from quotes where org_id = \'org_a\' ; from audit_log where (org_id = \'org_a\' and entity_type = \'quote\' and action in (\'quote.submitted\', \'quote.approved\', \'quote.sentback\', \'quote.withdrawn\') and timestamp >= \'a time\') order by timestamp desc limit 5000',
            'User Dispatcher Technician ReadOnly Nonsense: 403',
        ]],
        ['GET ?opportunityId=true', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: quotes= ; from opportunities where org_id = \'org_a\'',
        ]],
        ['a Manager who manages Other Rep', [
            'Admin Dispatcher: quotes=mine,theirs,none ; from opportunities where org_id = \'org_a\' ; from quotes where org_id = \'org_a\' order by created_at desc',
            'Manager: quotes=theirs,none ; from opportunities where org_id = \'org_a\' ; from quotes where org_id = \'org_a\' order by created_at desc',
            'User ReadOnly Nonsense: quotes=mine ; from opportunities where org_id = \'org_a\' ; from quotes where org_id = \'org_a\' order by created_at desc',
            'Technician: quotes= ; from opportunities where org_id = \'org_a\' ; from quotes where org_id = \'org_a\' order by created_at desc',
        ], {
            'quotes': 'acceptedAt approvalNote approvalReason approvalTier approvedAt approvedBy billingContact createdAt createdBy dealDiscount id lineItems name notes oneTimeValue opportunityId orgId paymentTerms quoteNumber recurringValue sentAt status subtotal syncedToOpp taxAmount taxExempt taxRate totalValue updatedAt validUntil version',
        }],
        ['unassigned deals shown to reps', [
            'Admin Manager Dispatcher: quotes=mine,theirs,none ; from opportunities where org_id = \'org_a\' ; from quotes where org_id = \'org_a\' order by created_at desc',
            'User ReadOnly Nonsense: quotes=mine,none ; from opportunities where org_id = \'org_a\' ; from quotes where org_id = \'org_a\' order by created_at desc',
            'Technician: quotes= ; from opportunities where org_id = \'org_a\' ; from quotes where org_id = \'org_a\' order by created_at desc',
        ]],
        ['a caller with no row here', [
            'Admin Manager Dispatcher: quotes=mine,theirs,none ; from opportunities where org_id = \'org_a\' ; from quotes where org_id = \'org_a\' order by created_at desc',
            'User Technician ReadOnly Nonsense: quotes= ; from opportunities where org_id = \'org_a\' ; from quotes where org_id = \'org_a\' order by created_at desc',
        ]],
        ['of the deal mine', [
            'Admin Manager User Dispatcher ReadOnly Nonsense: quotes=mine,theirs,none ; from opportunities where org_id = \'org_a\' ; from quotes where (org_id = \'org_a\' and opportunity_id = \'opportunities:mine\') order by quote_number asc, version asc',
            'Technician: quotes= ; from opportunities where org_id = \'org_a\'',
        ]],
        ['the history of the quote mine', [
            'Admin Manager User Dispatcher ReadOnly Nonsense: {events} ; from opportunities where org_id = \'org_a\' ; from quotes where (id = \'quotes:mine\' and org_id = \'org_a\') limit 1 ; from audit_log where (org_id = \'org_a\' and entity_type = \'quote\' and entity_id = \'quotes:mine\') order by timestamp desc limit 200',
            'Technician: 404',
        ], {
        }],
        ['of the deal theirs', [
            'Admin Manager Dispatcher: quotes=mine,theirs,none ; from opportunities where org_id = \'org_a\' ; from quotes where (org_id = \'org_a\' and opportunity_id = \'opportunities:theirs\') order by quote_number asc, version asc',
            'User Technician ReadOnly Nonsense: quotes= ; from opportunities where org_id = \'org_a\'',
        ], {
            'quotes': 'acceptedAt approvalNote approvalReason approvalTier approvedAt approvedBy billingContact createdAt createdBy dealDiscount id lineItems name notes oneTimeValue opportunityId orgId paymentTerms quoteNumber recurringValue sentAt status subtotal syncedToOpp taxAmount taxExempt taxRate totalValue updatedAt validUntil version',
        }],
        ['the history of the quote theirs', [
            'Admin Manager Dispatcher: {events} ; from opportunities where org_id = \'org_a\' ; from quotes where (id = \'quotes:theirs\' and org_id = \'org_a\') limit 1 ; from audit_log where (org_id = \'org_a\' and entity_type = \'quote\' and entity_id = \'quotes:theirs\') order by timestamp desc limit 200',
            'User Technician ReadOnly Nonsense: 404',
        ], {
        }],
    ],
    'recommendation-log': [
        ['GET no query', [
            'Admin Manager: logs=mine,theirs,none {summary} ; from recommendation_log where (org_id = \'org_a\' and dismissed_at >= \'a time\' and action_type not like \'renewal%\') order by dismissed_at desc',
            'User Dispatcher Technician ReadOnly Nonsense: logs=mine,theirs,none {summary} ; from recommendation_log where (org_id = \'org_a\' and dismissed_at >= \'a time\' and action_type not like \'renewal%\' and rep_name = \'Me Rep\') order by dismissed_at desc',
        ], {
            'logs': 'actionType arrAtRisk createdAt daysToResolve dealName dismissedAt id opportunityId orgId outcome repName resolvedAt signal stage',
        }],
        ['GET ?days=true', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: logs=mine,theirs,none {summary} ; a day the request made up',
        ]],
        ['GET ?rep=true', [
            'Admin Manager: logs=mine,theirs,none {summary} ; from recommendation_log where (org_id = \'org_a\' and dismissed_at >= \'a time\' and action_type not like \'renewal%\' and rep_name = \'true\') order by dismissed_at desc',
            'User Dispatcher Technician ReadOnly Nonsense: logs=mine,theirs,none {summary} ; from recommendation_log where (org_id = \'org_a\' and dismissed_at >= \'a time\' and action_type not like \'renewal%\' and rep_name = \'Me Rep\') order by dismissed_at desc',
        ]],
        ['a caller with no row here', [
            'Admin Manager: logs=mine,theirs,none {summary} ; from recommendation_log where (org_id = \'org_a\' and dismissed_at >= \'a time\' and action_type not like \'renewal%\') order by dismissed_at desc',
            'User Dispatcher Technician ReadOnly Nonsense: logs= {summary} ; from recommendation_log where (org_id = \'org_a\' and dismissed_at >= \'a time\' and action_type not like \'renewal%\') order by dismissed_at desc',
        ]],
    ],
    'report-deliveries': [
        ['GET no query', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: {skipped,reason}',
        ]],
    ],
    'saved-reports': [
        ['GET no query', [
            'Admin: reports=mine,theirs,none ; from saved_reports where org_id = \'org_a\' order by updated_at desc ; from users where org_id = \'org_a\'',
            'Manager User Dispatcher Technician ReadOnly Nonsense: reports=mine,theirs,none ; from saved_reports where (org_id = \'org_a\' and (owner_id = \'user_me\' or is_shared = true)) order by updated_at desc ; from users where org_id = \'org_a\'',
        ], {
            'reports': 'chartType config createdAt description dims filters id isShared metrics name orgId ownerId ownerName source updatedAt',
        }],
    ],
    'score-deals-batch': [
        ['GET no query', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: {skipped,reason}',
        ]],
    ],
    'score-leads-batch': [
        ['GET no query', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: {skipped,reason}',
        ]],
    ],
    'settings': [
        ['GET no query', [
            'Admin: settings.quotaData.commissionTiers=1,2,3,4 settings.pipelines=default settings.kpiConfig=totalPipelineARR,activeOpps,avgARR,nextQForecast,openTasks,quota,closedWon,attainment settings.leadScoring.fit.rules=f_title_exec,f_title_vp,f_title_dir,f_title_mgr,f_arr_250,f_arr_100,f_arr_50,f_src_ref,f_src_inb settings.leadScoring.engagement.rules=e_qualified,e_working,e_contacted,e_new,e_recency,e_demo,e_meeting,e_schedule,e_call,e_email settings.productTypes=recurring,one_time,service settings.dispatchBlockTypes=bt_pto,bt_sick,bt_holiday,bt_training,bt_jury,bt_bereavement,bt_other settings=org ; from settings where org_id = \'org_a\' order by updated_at desc',
            'Manager User Dispatcher Technician ReadOnly Nonsense: settings.quotaData.commissionTiers=1,2,3,4 settings.pipelines=default settings.kpiConfig=totalPipelineARR,activeOpps,avgARR,nextQForecast,openTasks,quota,closedWon,attainment settings.leadScoring.fit.rules=f_title_exec,f_title_vp,f_title_dir,f_title_mgr,f_arr_250,f_arr_100,f_arr_50,f_src_ref,f_src_inb settings.leadScoring.engagement.rules=e_qualified,e_working,e_contacted,e_new,e_recency,e_demo,e_meeting,e_schedule,e_call,e_email settings.productTypes=recurring,one_time,service settings.dispatchBlockTypes=bt_pto,bt_sick,bt_holiday,bt_training,bt_jury,bt_bereavement,bt_other settings=org ; from settings where org_id = \'org_a\' order by updated_at desc ; less than an Admin: settings.slackConfig changed, settings.integrationRequests changed, settings.anthropicApiKeyLast4 changed',
        ], {
            'settings.quotaData.commissionTiers': 'id label maxPercent minPercent rate',
            'settings.pipelines': 'color id name',
            'settings.kpiConfig': 'color id name tolerances',
            'settings.leadScoring.fit.rules': 'field id label op points value',
            'settings.leadScoring.engagement.rules': 'field id label op points value',
            'settings.productTypes': 'id lineKind name',
            'settings.dispatchBlockTypes': 'color id name',
            'settings': 'accountSegmentTiers aiReportPromptsEnabled aiScoringEnabled aiSettings anthropicApiKeyLast4 anthropicApiKeySet approvalRouting approvalTiers assignmentRules buyerPersonas commissionPlan commissionTiers companyAddress companyBrandColor companyCity companyCountry companyDisplayName companyLegalName companyLogo companyName companyPhone companyProfile companyState companySupportEmail companyZip competitors connectedApps customFieldsByObject customHolidays customerNotifications customerTypeTiers customerTypes dealModel dispatchBlockTypes dispatchCerts dispatchCrews dispatchEnabled dispatchEquipment dispatchJobTemplates dispatchJobTypes dispatchJobs dispatchLicenses dispatchPropertyTypes dispatchSkills dispatchTrades dispatchVehicles emailTemplates featureFlags federalHolidays fiscalYearStart funnelStages industries integrationRequests kpiConfig kpiTargets kpiThresholds kpiTolerances leadConvBenchmarks leadScoring leadsEnabled logoUrl painPoints pipelines priceBookProducts productTypes products quotaData quotaPeriods quoteBoilerplate quoteBrand quoteDefaults quoteHeader quoteTemplates quotesEnabled reasonsLost reasonsWon repsCanUseDispatch revs slackConfig spiffs taskTypes teams territories unassignedDealsVisibleToReps unassignedLeadsVisibleToReps verticalMarkets verticals webToLead',
        }],
    ],
    'spiff-claims': [
        ['GET no query', [
            'Admin Manager: spiffClaims=mine,theirs,none,by-name ; from spiff_claims where org_id = \'org_a\' order by claimed_at desc',
            'User ReadOnly Nonsense: spiffClaims=mine,by-name ; from spiff_claims where org_id = \'org_a\' order by claimed_at desc ; from opportunities where (id in (\'opportunities:mine\', \'opportunities:theirs\', \'opportunities:none\') and org_id = \'org_a\')',
            'Dispatcher: spiffClaims=mine,theirs,none,by-name ; from spiff_claims where org_id = \'org_a\' order by claimed_at desc ; from opportunities where (id in (\'opportunities:mine\', \'opportunities:theirs\', \'opportunities:none\') and org_id = \'org_a\')',
            'Technician: spiffClaims= ; from spiff_claims where org_id = \'org_a\' order by claimed_at desc',
        ], {
            'spiffClaims': 'account amount approvedAt approvedBy claimedAt createdAt dealArr id multiplier note opportunityId opportunityName orgId paidAt repName spiffId spiffName spiffType status updatedAt',
        }],
        ['unassigned deals shown to reps', [
            'Admin Manager: spiffClaims=mine,theirs,none,by-name ; from spiff_claims where org_id = \'org_a\' order by claimed_at desc',
            'User ReadOnly Nonsense: spiffClaims=mine,none,by-name ; from spiff_claims where org_id = \'org_a\' order by claimed_at desc ; from opportunities where (id in (\'opportunities:mine\', \'opportunities:theirs\', \'opportunities:none\') and org_id = \'org_a\')',
            'Dispatcher: spiffClaims=mine,theirs,none,by-name ; from spiff_claims where org_id = \'org_a\' order by claimed_at desc ; from opportunities where (id in (\'opportunities:mine\', \'opportunities:theirs\', \'opportunities:none\') and org_id = \'org_a\')',
            'Technician: spiffClaims= ; from spiff_claims where org_id = \'org_a\' order by claimed_at desc',
        ]],
        ['a caller with no row here', [
            'Admin Manager: spiffClaims=mine,theirs,none,by-name ; from spiff_claims where org_id = \'org_a\' order by claimed_at desc',
            'User ReadOnly Nonsense: spiffClaims= ; from spiff_claims where org_id = \'org_a\' order by claimed_at desc ; from opportunities where (id in (\'opportunities:mine\', \'opportunities:theirs\', \'opportunities:none\') and org_id = \'org_a\')',
            'Dispatcher: spiffClaims=mine,theirs,none,by-name ; from spiff_claims where org_id = \'org_a\' order by claimed_at desc ; from opportunities where (id in (\'opportunities:mine\', \'opportunities:theirs\', \'opportunities:none\') and org_id = \'org_a\')',
            'Technician: spiffClaims= ; from spiff_claims where org_id = \'org_a\' order by claimed_at desc',
        ]],
    ],
    'task-reminders': [
        ['GET no query', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: {skipped,reason}',
        ]],
    ],
    'tasks': [
        ['GET no query', [
            'Admin Manager Dispatcher: tasks=mine,theirs,none ; from tasks where org_id = \'org_a\' order by due_date asc',
            'User ReadOnly Nonsense: tasks=mine,none ; from tasks where org_id = \'org_a\' order by due_date asc',
            'Technician: tasks= ; from tasks where org_id = \'org_a\' order by due_date asc',
        ], {
            'tasks': 'accountId assignedTo completed completedDate contactId contacts createdAt description dueDate dueTime id opportunityId orgId ownerId priority relatedTo reminderDate reminderTime status title type updatedAt',
        }],
        ['a caller with no row here', [
            'Admin Manager Dispatcher: tasks=mine,theirs,none ; from tasks where org_id = \'org_a\' order by due_date asc',
            'User ReadOnly Nonsense: tasks=none ; from tasks where org_id = \'org_a\' order by due_date asc',
            'Technician: tasks= ; from tasks where org_id = \'org_a\' order by due_date asc',
        ]],
    ],
    'users': [
        ['GET no query', [
            'Admin Manager: users=mine,theirs,none ; from users where org_id = \'org_a\' order by name asc',
            'User Technician ReadOnly Nonsense: users=mine,theirs,none {directory} ; from users where org_id = \'org_a\' order by name asc ; less than an Admin: users.clerkUserId left out, users.email left out, users.userType left out, users.role left out, users.team left out, users.territory left out, users.quota left out, users.teamJoinedAt left out',
            'Dispatcher: users=mine,theirs,none {directory} ; from users where org_id = \'org_a\' order by name asc ; less than an Admin: users.clerkUserId left out, users.email left out, users.quota left out, users.teamJoinedAt left out',
        ], {
            'users': 'active clerkUserId email id name quota role team teamJoinedAt territory userType',
        }],
        ['GET ?invitations=pending', [
            'Admin: invitations=',
            'Manager: 403',
            'User Dispatcher Technician ReadOnly Nonsense: users=mine,theirs,none {directory} ; from users where org_id = \'org_a\' order by name asc',
        ], {
        }],
        ['GET ?me=true', [
            'Admin Manager User Dispatcher Technician ReadOnly Nonsense: user=mine',
        ], {
            'user': 'active clerkUserId email id name quota role team teamJoinedAt territory userType',
        }],
        ['GET ?seats=true', [
            'Admin: {limit,members,pendingInvitations}',
            'Manager: 403',
            'User Dispatcher Technician ReadOnly Nonsense: users=mine,theirs,none {directory} ; from users where org_id = \'org_a\' order by name asc',
        ], {
        }],
    ],
    'webhooks': [
        ['GET no query', [
            'Admin: webhooks=mine,theirs,none {supportedEvents} ; from webhook_subscriptions where org_id = \'org_a\'',
            'Manager User Dispatcher Technician ReadOnly Nonsense: 403',
        ], {
            'webhooks': 'active createdAt eventTypes id lastFiredAt lastStatus name secretMasked targetUrl updatedAt',
        }],
    ],
};

// The db statements of each file no request reaches (tests/row-matrix.test.mjs): a count that only falls.
export const UNREACHED = {
    '_bulk.mjs': 1,
    '_callerRole.mjs': 1,
    '_customerNotify.mjs': 4,
    '_dealScore.mjs': 1,
    '_heartbeat.mjs': 2,
    '_lib.mjs': 4,
    '_links.mjs': 14,
    'accounts.mjs': 6,
    'ai-score.mjs': 4,
    'api-keys.mjs': 1,
    'audit-stream.mjs': 1,
    'automations.mjs': 1,
    'backup.mjs': 3,
    'calendar-add-event.mjs': 2,
    'coaching-notes.mjs': 1,
    'dashboard-configs.mjs': 1,
    'digest.mjs': 7,
    'dispatch-automations.mjs': 4,
    'dispatch-customers.mjs': 1,
    'dispatch-jobs.mjs': 2,
    'dispatch-plan-visits.mjs': 1,
    'dispatch-technicians.mjs': 2,
    'documents.mjs': 1,
    'email-inbound.mjs': 2,
    'export-dsr.mjs': 1,
    'export-runs.mjs': 2,
    'export-schedules.mjs': 1,
    'integration-requests.mjs': 5,
    'invoices.mjs': 2,
    'lead-intake.mjs': 1,
    'lead-requests.mjs': 9,
    'merge.mjs': 64,
    'opportunities.mjs': 2,
    'pipeline-alerts.mjs': 9,
    'products.mjs': 1,
    'quote-email.mjs': 5,
    'quote-reminders.mjs': 5,
    'quote-to-job.mjs': 2,
    'quotes.mjs': 5,
    'recommendation-log.mjs': 9,
    'report-deliveries.mjs': 2,
    'report-prompt.mjs': 1,
    'saved-reports.mjs': 1,
    'score-deals-batch.mjs': 1,
    'score-leads-batch.mjs': 3,
    'settings.mjs': 3,
    'spiff-claims.mjs': 2,
    'task-reminders.mjs': 4,
    'users-sync.mjs': 2,
    'users.mjs': 9,
    'webhooks.mjs': 2,
};
