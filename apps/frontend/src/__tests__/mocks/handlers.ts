import { http, HttpResponse } from 'msw';

const BASE = 'http://localhost:3001/api';

export const handlers = [
  // Auth
  http.post(`${BASE}/auth/login`, () =>
    HttpResponse.json({
      data: {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        user: { id: 'user-1', email: 'usuario@ejemplo.com', role: 'USER' },
      },
    })
  ),

  // Users
  http.get(`${BASE}/users/me`, () =>
    HttpResponse.json({
      data: {
        id: 'user-1',
        email: 'usuario@ejemplo.com',
        role: 'USER',
      },
    })
  ),

  http.get(`${BASE}/users/me/profiles`, () =>
    HttpResponse.json({
      data: [
        {
          id: 'profile-1',
          firstName: 'Juan',
          lastName: 'Pérez',
          documentType: 'DNI',
          documentNumber: '12345678',
        },
      ],
    })
  ),

  // Bookings
  http.post(`${BASE}/bookings`, () =>
    HttpResponse.json({
      data: { id: 'booking-1', status: 'SEARCHING' },
    })
  ),

  http.get(`${BASE}/bookings/:id`, ({ params }) =>
    HttpResponse.json({
      data: {
        id: params.id,
        status: 'SEARCHING',
        procedure: { name: 'Trámite Demo', serviceFee: 50, currency: 'ARS' },
        applicantProfile: { firstName: 'Juan', lastName: 'Pérez', documentType: 'DNI', documentNumber: '12345678' },
        createdAt: new Date().toISOString(),
      },
    })
  ),

  // Payments
  http.post(`${BASE}/payments/demo-checkout`, () =>
    HttpResponse.json({
      data: { demo: true, paymentId: 'payment-1' },
    })
  ),

  http.post(`${BASE}/payments/checkout`, () =>
    HttpResponse.json({
      data: { url: 'https://checkout.stripe.com/mock' },
    })
  ),
];
