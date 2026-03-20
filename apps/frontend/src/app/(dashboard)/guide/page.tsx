'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  BookOpen, Zap, Hand, Shield, ChevronRight, ChevronDown,
  CheckCircle, Clock, CreditCard, FileText, Users, Building2,
  ArrowRight, Play, Star, AlertCircle, Info, Search,
  Calendar, Lock, RefreshCw, Award, HelpCircle, ExternalLink,
} from 'lucide-react';

// ─── Section IDs ─────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'what-is', label: '¿Qué es?' },
  { id: 'how-it-works', label: 'Cómo funciona' },
  { id: 'procedures', label: 'Trámites disponibles' },
  { id: 'integration-modes', label: 'Modos de integración' },
  { id: 'booking-flow', label: 'Proceso paso a paso' },
  { id: 'payments', label: 'Pagos y tarifas' },
  { id: 'security', label: 'Seguridad y privacidad' },
  { id: 'faq', label: 'Preguntas frecuentes' },
];

// ─── Procedure catalog data ───────────────────────────────────────────────────
const PROCEDURE_CATEGORIES = [
  {
    icon: '💼',
    name: 'Empleo',
    color: 'from-blue-50 to-blue-100 border-blue-200',
    iconBg: 'bg-blue-100 text-blue-700',
    procedures: [
      { name: 'Prestación por desempleo (SEPE)', fee: '19,99 €', time: '45 min', mode: 'manual' },
      { name: 'Alta en demanda de empleo', fee: '9,99 €', time: '20 min', mode: 'manual' },
      { name: 'Subsidio por desempleo', fee: '19,99 €', time: '45 min', mode: 'manual' },
    ],
  },
  {
    icon: '🚗',
    name: 'Tráfico y vehículos',
    color: 'from-orange-50 to-orange-100 border-orange-200',
    iconBg: 'bg-orange-100 text-orange-700',
    procedures: [
      { name: 'Canje de permiso de conducir extranjero', fee: '24,99 €', time: '60 min', mode: 'manual' },
      { name: 'Renovación del carnet de conducir', fee: '14,99 €', time: '30 min', mode: 'manual' },
      { name: 'Transferencia de vehículo', fee: '19,99 €', time: '40 min', mode: 'manual' },
    ],
  },
  {
    icon: '🌍',
    name: 'Extranjería',
    color: 'from-green-50 to-green-100 border-green-200',
    iconBg: 'bg-green-100 text-green-700',
    procedures: [
      { name: 'Renovación de NIE / TIE', fee: '24,99 €', time: '60 min', mode: 'manual' },
      { name: 'Solicitud de residencia', fee: '29,99 €', time: '90 min', mode: 'manual' },
      { name: 'Reagrupación familiar', fee: '29,99 €', time: '90 min', mode: 'manual' },
    ],
  },
  {
    icon: '🏛️',
    name: 'Administración general',
    color: 'from-purple-50 to-purple-100 border-purple-200',
    iconBg: 'bg-purple-100 text-purple-700',
    procedures: [
      { name: 'Certificado de empadronamiento', fee: '9,99 €', time: '15 min', mode: 'api' },
      { name: 'Cita en Registro Civil', fee: '14,99 €', time: '30 min', mode: 'manual' },
      { name: 'Solicitud de certificados AEAT', fee: '9,99 €', time: '20 min', mode: 'manual' },
    ],
  },
  {
    icon: '🏥',
    name: 'Sanidad',
    color: 'from-red-50 to-red-100 border-red-200',
    iconBg: 'bg-red-100 text-red-700',
    procedures: [
      { name: 'Tarjeta sanitaria individual', fee: '9,99 €', time: '20 min', mode: 'manual' },
      { name: 'Cita médico de cabecera', fee: '9,99 €', time: '15 min', mode: 'api' },
      { name: 'Historial clínico digital', fee: '9,99 €', time: '20 min', mode: 'manual' },
    ],
  },
  {
    icon: '🎓',
    name: 'Educación',
    color: 'from-yellow-50 to-yellow-100 border-yellow-200',
    iconBg: 'bg-yellow-100 text-yellow-700',
    procedures: [
      { name: 'Homologación de títulos extranjeros', fee: '24,99 €', time: '60 min', mode: 'manual' },
      { name: 'Matrícula universitaria pública', fee: '14,99 €', time: '30 min', mode: 'manual' },
      { name: 'Becas MEC', fee: '14,99 €', time: '40 min', mode: 'manual' },
    ],
  },
];

// ─── FAQ data ─────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: '¿Esta app reserva la cita por mí automáticamente?',
    a: 'Depende del organismo. Si dispone de una API oficial o integración autorizada, sí lo hacemos de forma completamente automática. Si no, preparamos todos tus datos y te guiamos paso a paso para que tú completes la reserva en el portal oficial en menos de 2 minutos.',
  },
  {
    q: '¿Qué pasa si no hay citas disponibles?',
    a: 'En los organismos con integración permitida, monitorizamos la disponibilidad y te notificamos en cuanto aparezca un hueco. En modo asistido, te indicamos cuándo y cómo revisar el portal oficial.',
  },
  {
    q: '¿Puedo gestionar citas para otra persona?',
    a: 'Sí. Puedes crear múltiples perfiles de solicitante en tu cuenta (familiares, empleados, etc.) y gestionar citas para cada uno de ellos desde un único panel.',
  },
  {
    q: '¿Qué documentos necesito tener listos?',
    a: 'Cada trámite muestra exactamente qué documentos son necesarios antes de empezar. Generalmente: DNI/NIE/Pasaporte, número de afiliación a la Seguridad Social (para trámites de empleo), y documentos específicos del trámite.',
  },
  {
    q: '¿Cuánto cuesta el servicio?',
    a: 'Cobramos una tarifa de gestión que varía según la complejidad del trámite (entre 9,99 € y 29,99 €). Esta tarifa cubre la preparación de datos, validación, gestión y soporte. Las tasas oficiales del organismo, si las hubiera, son adicionales y se pagan directamente al organismo.',
  },
  {
    q: '¿Qué pasa si algo sale mal?',
    a: 'Si el trámite no se puede completar por causas imputables a nuestra plataforma, aplicamos nuestra política de reembolso. Si el problema es del portal oficial (caída, cambio de requisitos), te notificamos y te asistimos para reintentar.',
  },
  {
    q: '¿Es legal usar esta app?',
    a: 'Sí. Actuamos como intermediario legal, igual que una gestoría tradicional. Solo automatizamos procesos a través de canales oficiales y autorizados. Nunca eludimos sistemas de seguridad, CAPTCHAs ni términos de uso de los portales.',
  },
  {
    q: '¿Cómo protegéis mis datos personales?',
    a: 'Tus datos se cifran con AES-256-GCM en reposo. Cumplimos el RGPD: puedes solicitar la exportación o eliminación de tus datos en cualquier momento desde tu perfil. Solo conservamos los datos el tiempo estrictamente necesario.',
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionAnchor({ id }: { id: string }) {
  return <div id={id} className="scroll-mt-24" />;
}

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-10 text-center">
      <span className="inline-block text-xs font-semibold uppercase tracking-widest text-primary mb-3 bg-accent px-3 py-1 rounded-full">
        {eyebrow}
      </span>
      <h2 className="text-2xl font-bold text-foreground mb-3">{title}</h2>
      {subtitle && <p className="text-muted-foreground max-w-xl mx-auto text-sm leading-relaxed">{subtitle}</p>}
    </div>
  );
}

function ModeChip({ mode }: { mode: string }) {
  if (mode === 'api') return (
    <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
      <Zap className="h-3 w-3" /> Automático
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
      <Hand className="h-3 w-3" /> Asistido
    </span>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted transition-colors"
      >
        <span className="font-medium text-sm pr-4">{q}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed border-t bg-muted/30 pt-3">
          {a}
        </div>
      )}
    </div>
  );
}

// ─── Booking flow steps ───────────────────────────────────────────────────────
const FLOW_STEPS = [
  {
    number: '01',
    icon: Search,
    title: 'Elige tu trámite',
    description: 'Busca por organismo, categoría o nombre. Cada trámite muestra el coste, tiempo estimado y modo de integración.',
    color: 'bg-blue-50 border-blue-200 text-blue-700',
    dot: 'bg-blue-500',
  },
  {
    number: '02',
    icon: Users,
    title: 'Selecciona el solicitante',
    description: 'Elige un perfil guardado o crea uno nuevo. Puedes gestionar citas para ti, familiares o terceros.',
    color: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    dot: 'bg-indigo-500',
  },
  {
    number: '03',
    icon: FileText,
    title: 'Completa el formulario',
    description: 'Solo los campos necesarios para ese trámite específico. Validación en tiempo real. Puedes guardar el borrador.',
    color: 'bg-violet-50 border-violet-200 text-violet-700',
    dot: 'bg-violet-500',
  },
  {
    number: '04',
    icon: CreditCard,
    title: 'Paga el servicio',
    description: 'Pago seguro con Stripe. Tarjeta de crédito/débito. Recibes factura inmediatamente.',
    color: 'bg-purple-50 border-purple-200 text-purple-700',
    dot: 'bg-purple-500',
  },
  {
    number: '05',
    icon: Calendar,
    title: 'Confirmación de cita',
    description: 'Si hay integración oficial: reserva automática y código de confirmación. Si no: te guiamos para completarlo en 2 minutos.',
    color: 'bg-green-50 border-green-200 text-green-700',
    dot: 'bg-green-500',
  },
];

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function GuidePage() {
  const [activeSection, setActiveSection] = useState('what-is');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observerRef.current?.observe(el);
    });
    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div className="flex gap-8 max-w-6xl mx-auto">
      {/* Sticky TOC */}
      <aside className="hidden lg:block w-48 shrink-0">
        <div className="sticky top-6 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Contenido</p>
          {SECTIONS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className={cn(
                'block text-xs py-1 px-2 rounded transition-colors',
                activeSection === id
                  ? 'text-foreground font-medium bg-accent'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </a>
          ))}
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 space-y-20 pb-20">

        {/* What is */}
        <section>
          <SectionAnchor id="what-is" />
          <SectionHeading eyebrow="La plataforma" title="¿Qué es el Gestor de Citas?" subtitle="Un intermediario digital que simplifica la gestión de trámites con la administración pública española." />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: Zap, title: 'Automatización', desc: 'Reserva citas automáticamente cuando el organismo lo permite.' },
              { icon: Hand, title: 'Asistencia guiada', desc: 'Te preparamos todo para que tú completes en 2 minutos.' },
              { icon: Shield, title: 'Seguridad y RGPD', desc: 'Datos cifrados, cumplimiento total con la normativa europea.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white border rounded-lg p-5">
                <Icon className="h-6 w-6 text-primary mb-3" />
                <p className="font-semibold text-sm mb-1">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section>
          <SectionAnchor id="how-it-works" />
          <SectionHeading eyebrow="El proceso" title="Cómo funciona" />
          <div className="space-y-3">
            {FLOW_STEPS.map((step) => (
              <div key={step.number} className={`flex items-start gap-4 p-4 rounded-lg border ${step.color}`}>
                <div className="shrink-0 w-8 h-8 rounded-full bg-white flex items-center justify-center text-xs font-bold shadow-sm">
                  {step.number}
                </div>
                <div>
                  <p className="font-semibold text-sm">{step.title}</p>
                  <p className="text-xs mt-0.5 opacity-80">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Procedures */}
        <section>
          <SectionAnchor id="procedures" />
          <SectionHeading eyebrow="Catálogo" title="Trámites disponibles" subtitle="Más de 18 trámites en 6 categorías." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PROCEDURE_CATEGORIES.map((cat) => (
              <div key={cat.name} className={`bg-gradient-to-br ${cat.color} border rounded-lg p-5`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-lg w-8 h-8 flex items-center justify-center rounded-md ${cat.iconBg}`}>{cat.icon}</span>
                  <p className="font-semibold text-sm">{cat.name}</p>
                </div>
                <div className="space-y-2">
                  {cat.procedures.map((p) => (
                    <div key={p.name} className="flex items-center justify-between bg-white/60 rounded px-3 py-2">
                      <p className="text-xs font-medium truncate pr-2">{p.name}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <ModeChip mode={p.mode} />
                        <span className="text-xs font-semibold">{p.fee}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Integration modes */}
        <section>
          <SectionAnchor id="integration-modes" />
          <SectionHeading eyebrow="Integración" title="Modos de integración" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-5 w-5 text-green-600" />
                <p className="font-semibold text-green-800">Automático (API)</p>
              </div>
              <p className="text-sm text-green-700">El organismo dispone de una API oficial. La reserva se completa sin intervención manual. Recibes confirmación y código de cita al instante.</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-3">
                <Hand className="h-5 w-5 text-gray-600" />
                <p className="font-semibold text-gray-800">Asistido (manual)</p>
              </div>
              <p className="text-sm text-gray-600">Preparamos todos tus datos y te guiamos paso a paso. Tú completas la reserva en el portal oficial en menos de 2 minutos con todo listo.</p>
            </div>
          </div>
        </section>

        {/* Booking flow */}
        <section>
          <SectionAnchor id="booking-flow" />
          <SectionHeading eyebrow="Paso a paso" title="Proceso de reserva" />
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-6 pl-12">
              {FLOW_STEPS.map((step) => (
                <div key={step.number} className="relative">
                  <div className={`absolute -left-9 w-4 h-4 rounded-full border-2 border-white ${step.dot}`} />
                  <p className="font-semibold text-sm">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Payments */}
        <section>
          <SectionAnchor id="payments" />
          <SectionHeading eyebrow="Tarifas" title="Pagos y precios" subtitle="Tarifa de gestión única por trámite. Sin suscripciones." />
          <div className="bg-white border rounded-lg divide-y">
            {[
              { label: 'Trámites simples (certificados, altas)', price: '9,99 €' },
              { label: 'Trámites estándar (renovaciones, citas)', price: '14,99 €' },
              { label: 'Trámites complejos (extranjería, homologaciones)', price: '24,99 – 29,99 €' },
            ].map(({ label, price }) => (
              <div key={label} className="flex items-center justify-between px-5 py-4">
                <p className="text-sm">{label}</p>
                <p className="text-sm font-semibold">{price}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Las tasas oficiales del organismo, si las hubiera, son adicionales y se pagan directamente al organismo.</p>
        </section>

        {/* Security */}
        <section>
          <SectionAnchor id="security" />
          <SectionHeading eyebrow="Privacidad" title="Seguridad y protección de datos" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: Lock, title: 'Cifrado AES-256-GCM', desc: 'Todos los datos personales se cifran en reposo.' },
              { icon: Shield, title: 'Cumplimiento RGPD', desc: 'Puedes exportar o eliminar tus datos en cualquier momento.' },
              { icon: RefreshCw, title: 'Retención mínima', desc: 'Solo conservamos datos el tiempo estrictamente necesario.' },
              { icon: Award, title: 'Intermediario legal', desc: 'Operamos como gestoría digital, dentro del marco legal vigente.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3 bg-white border rounded-lg p-4">
                <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section>
          <SectionAnchor id="faq" />
          <SectionHeading eyebrow="Dudas" title="Preguntas frecuentes" />
          <div className="space-y-2">
            {FAQ_ITEMS.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
