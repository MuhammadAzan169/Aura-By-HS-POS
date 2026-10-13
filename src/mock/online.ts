import type { Announcement, Appointment, ChatMessage, Customer, CustomerCredit, OnlinePayment, Service, Shop } from '@/types';

/**
 * Demo rows for the customer-app side of the POS: payments made from the app and
 * from payment links, a bank transfer waiting to be checked, two chats and the
 * announcements every app user sees.
 */
export function buildOnlineDemo(
  today: Date,
  shops: Shop[],
  customers: Customer[],
  appointments: Appointment[],
  services: Service[] = [],
): { onlinePayments: OnlinePayment[]; messages: ChatMessage[]; announcements: Announcement[]; customerCredits: CustomerCredit[] } {
  const iso = (minutesAgo: number): string => new Date(today.getTime() - minutesAgo * 60_000).toISOString();
  const shop = shops[0];
  if (!shop) return { onlinePayments: [], messages: [], announcements: [], customerCredits: [] };
  const upcoming = appointments
    .filter((a) => a.shopId === shop.id && ['pending', 'confirmed'].includes(a.status) && new Date(a.startAt) > today)
    .slice(0, 3);
  const cust = (id: string): Customer | undefined => customers.find((c) => c.id === id);

  const pay = (
    n: number,
    a: Appointment | undefined,
    fields: Partial<OnlinePayment> & Pick<OnlinePayment, 'amount' | 'method' | 'status'>,
  ): OnlinePayment => {
    const c = a ? cust(a.customerId) : undefined;
    return {
      id: `opy_demo_${n}`,
      createdAt: iso(60 * n),
      updatedAt: iso(30 * n),
      paymentNo: `PAY-DEMO-${String(n).padStart(4, '0')}`,
      shopId: a?.shopId ?? shop.id,
      purpose: 'appointment',
      refId: a?.id ?? null,
      refLabel: (a?.services ?? []).map((x) => services.find((s) => s.id === x.serviceId)?.name ?? 'Service').join(' + ') || 'Appointment',
      customerId: c?.id ?? null,
      customerName: c?.name ?? 'Walk-in',
      customerPhone: c?.phone ?? '',
      accountId: `demo-account-${n}`,
      plan: 'advance',
      token: `demoToken${n}`,
      gateway: fields.method === 'bank-transfer' ? 'manual' : 'simulator',
      gatewayRef: fields.status === 'paid' ? `SIM${1000 + n}` : null,
      gatewayMessage: null,
      slipPath: null,
      payerNote: '',
      paidAt: fields.status === 'paid' ? iso(30 * n) : null,
      verifiedBy: fields.status === 'paid' ? 'Online' : null,
      rejectReason: null,
      createdBy: 'app',
      channel: 'app',
      expiresAt: null,
      appliedAt: fields.status === 'paid' ? iso(30 * n) : null,
      voucher: null,
      attempts: [],
      ...fields,
    };
  };

  const onlinePayments: OnlinePayment[] = [];
  const customerCredits: CustomerCredit[] = [];
  if (upcoming[0]) {
    const p = pay(1, upcoming[0], { amount: 1500, method: 'jazzcash', status: 'paid' });
    onlinePayments.push(p);
    customerCredits.push({
      id: 'crd_demo_1',
      createdAt: p.createdAt,
      updatedAt: p.createdAt,
      shopId: p.shopId,
      customerId: p.customerId as string,
      amount: 1500,
      kind: 'advance',
      method: 'jazzcash',
      appointmentId: upcoming[0].id,
      saleId: null,
      note: `Online ${p.paymentNo} · JazzCash`,
      byUserName: 'Online',
    });
  }
  if (upcoming[1]) onlinePayments.push(pay(2, upcoming[1], { amount: 2000, method: 'bank-transfer', status: 'verifying', payerNote: 'Sent from Meezan, ref 88231' }));
  if (upcoming[2]) onlinePayments.push(pay(3, upcoming[2], { amount: 3500, method: null, status: 'pending', channel: 'link', createdBy: 'Front desk', plan: 'full', accountId: null }));

  const c0 = customers.find((c) => c.shopId === shop.id) ?? customers[0];
  const thread = (account: string, key: string): string => `${account}:${key}`;
  const msg = (n: number, account: string, key: string, from: ChatMessage['from'], text: string, minutesAgo: number, name: string): ChatMessage => ({
    id: `msg_demo_${n}`,
    createdAt: iso(minutesAgo),
    updatedAt: iso(minutesAgo),
    threadId: thread(account, key),
    shopId: key === 'hq' ? null : key,
    accountId: account,
    customerName: name,
    customerPhone: c0?.phone ?? '',
    from,
    authorName: from === 'customer' ? name : 'Front desk',
    text,
    imagePath: null,
    at: iso(minutesAgo),
    readByStaff: from !== 'customer' || minutesAgo > 120,
    readByCustomer: from === 'customer',
  });
  const name = c0?.name ?? 'Ayesha';
  const messages: ChatMessage[] = [
    msg(1, 'demo-account-1', shop.id, 'customer', 'Assalam o Alaikum, can I bring my reference photos for Saturday?', 300, name),
    msg(2, 'demo-account-1', shop.id, 'staff', 'Of course! Share them here and your artist will review before you arrive.', 290, name),
    msg(3, 'demo-account-1', shop.id, 'customer', 'Thank you! Also is parking available?', 20, name),
    msg(4, 'demo-account-2', 'hq', 'customer', 'Is 20 December free for the Bride Royal package?', 45, 'Mahnoor Khan'),
  ];

  const announcements: Announcement[] = [
    {
      id: 'ann_demo_1',
      createdAt: iso(60 * 50),
      updatedAt: iso(60 * 50),
      title: 'Bridal season bookings are open',
      body: 'Lock your dates with a 30% advance — Bride Signature and Bride Royal fill fast.',
      imageUrl: null,
      active: true,
      byUserName: 'Owner',
    },
    {
      id: 'ann_demo_2',
      createdAt: iso(60 * 3),
      updatedAt: iso(60 * 3),
      title: '15% off your first app booking',
      body: 'Use code AURA15 when you book in the app this month.',
      imageUrl: null,
      active: true,
      byUserName: 'Owner',
    },
  ];
  return { onlinePayments, messages, announcements, customerCredits };
}
