import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Phone, Mail, Edit, Plus, Calendar, FileText, MessageSquare, CheckSquare } from 'lucide-react';
import { ContactStatusBadge, BotStatusBadge, SERVICE_TYPE_LABELS } from '@/components/StatusBadge';
import { format } from 'date-fns';
import ContactFormDialog from '@/components/contacts/ContactFormDialog';
import ServiceRequestCard from '@/components/contacts/ServiceRequestCard';
import TaskCard from '@/components/contacts/TaskCard';
import CommunicationLog from '@/components/contacts/CommunicationLog';
import DocumentsList from '@/components/contacts/DocumentsList';
import MeetingsList from '@/components/contacts/MeetingsList';

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contact, setContact] = useState(null);
  const [serviceRequests, setServiceRequests] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [communications, setCommunications] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const load = async () => {
    const [c, srs, ts, comms, docs, meets] = await Promise.all([
      base44.entities.Contact.filter({ id }),
      base44.entities.ServiceRequest.filter({ contact_id: id }),
      base44.entities.Task.filter({ contact_id: id }),
      base44.entities.Communication.filter({ contact_id: id }),
      base44.entities.Document.filter({ contact_id: id }),
      base44.entities.Meeting.filter({ contact_id: id }),
    ]);
    setContact(c[0] || null);
    setServiceRequests(srs);
    setTasks(ts);
    setCommunications(comms);
    setDocuments(docs);
    setMeetings(meets);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  if (!contact) return (
    <div className="text-center py-20">
      <p className="text-muted-foreground">איש קשר לא נמצא</p>
      <Button variant="outline" onClick={() => navigate('/contacts')} className="mt-4">חזרה לרשימה</Button>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/contacts" className="hover:text-primary flex items-center gap-1">
          <ArrowRight size={14} />
          לקוחות
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{contact.full_name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
          {contact.full_name?.charAt(0)}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{contact.full_name}</h1>
            <ContactStatusBadge status={contact.status} />
            <BotStatusBadge status={contact.bot_status} />
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
            {contact.phone && <span className="flex items-center gap-1"><Phone size={13} />{contact.phone}</span>}
            {contact.email && <span className="flex items-center gap-1"><Mail size={13} />{contact.email}</span>}
            {contact.service_type && <span>{SERVICE_TYPE_LABELS[contact.service_type]}</span>}
            {contact.assigned_to && <span>מטופל/ת ע"י: <strong>{contact.assigned_to}</strong></span>}
          </div>
        </div>
        <Button variant="outline" onClick={() => setEditOpen(true)} className="gap-2">
          <Edit size={15} />
          עריכה
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general" dir="rtl">
        <TabsList className="grid grid-cols-6 w-full md:w-auto">
          <TabsTrigger value="general">כללי</TabsTrigger>
          <TabsTrigger value="requests">פניות ({serviceRequests.length})</TabsTrigger>
          <TabsTrigger value="documents">מסמכים ({documents.length})</TabsTrigger>
          <TabsTrigger value="meetings">פגישות ({meetings.length})</TabsTrigger>
          <TabsTrigger value="tasks">משימות ({tasks.length})</TabsTrigger>
          <TabsTrigger value="communications">תקשורת ({communications.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">פרטים כלליים</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="שם" value={contact.full_name} />
                <InfoRow label="טלפון" value={contact.phone} />
                <InfoRow label="אימייל" value={contact.email} />
                <InfoRow label="ת.ז." value={contact.id_number} />
                <InfoRow label="תאריך לידה" value={contact.birth_date ? format(new Date(contact.birth_date), 'dd/MM/yyyy') : null} />
                <InfoRow label="מקור" value={contact.source} />
                <InfoRow label="סוג שירות" value={SERVICE_TYPE_LABELS[contact.service_type]} />
                <InfoRow label="משויך/ת ל" value={contact.assigned_to} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">סטטוס ובוט</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <InfoRow label="סטטוס CRM" value={<ContactStatusBadge status={contact.status} />} />
                <InfoRow label="סטטוס בוט" value={<BotStatusBadge status={contact.bot_status} />} />
                <InfoRow label="שאלון שורנס" value={contact.shoranss_questionnaire} />
                <InfoRow label="חום ליד" value={contact.lead_temperature} />
                <InfoRow label="הסכמה לפנייה עתידית" value={contact.opt_in_future ? 'כן' : 'לא'} />
                {contact.notes && <InfoRow label="הערות" value={contact.notes} />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="requests" className="mt-4">
          <ServiceRequestCard
            contactId={id}
            serviceRequests={serviceRequests}
            onRefresh={load}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <DocumentsList contactId={id} documents={documents} onRefresh={load} />
        </TabsContent>

        <TabsContent value="meetings" className="mt-4">
          <MeetingsList contactId={id} meetings={meetings} onRefresh={load} />
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <TaskCard contactId={id} tasks={tasks} onRefresh={load} />
        </TabsContent>

        <TabsContent value="communications" className="mt-4">
          <CommunicationLog contactId={id} communications={communications} onRefresh={load} />
        </TabsContent>
      </Tabs>

      {editOpen && (
        <ContactFormDialog
          contact={contact}
          onClose={() => setEditOpen(false)}
          onSave={() => { setEditOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}