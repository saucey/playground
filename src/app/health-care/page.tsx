"use client";

import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChevronDown, Plus, Bell, Stethoscope, Pill, Activity, CalendarDays } from "lucide-react";

const patientData = [
  { id: 1, name: "John Smith", age: 45, condition: "Hypertension", lastVisit: "2023-06-10", status: "active" },
  { id: 2, name: "Sarah Johnson", age: 32, condition: "Diabetes", lastVisit: "2023-06-12", status: "active" },
  { id: 3, name: "Michael Brown", age: 58, condition: "Arthritis", lastVisit: "2023-06-05", status: "follow-up" },
  { id: 4, name: "Emily Davis", age: 28, condition: "Asthma", lastVisit: "2023-05-28", status: "inactive" },
  { id: 5, name: "Robert Wilson", age: 65, condition: "Heart Disease", lastVisit: "2023-06-15", status: "critical" },
];

const appointments = [
  { id: 1, patient: "John Smith", time: "09:00 AM", type: "Check-up", status: "confirmed" },
  { id: 2, patient: "Sarah Johnson", time: "10:30 AM", type: "Follow-up", status: "confirmed" },
  { id: 3, patient: "New Patient", time: "01:15 PM", type: "Consultation", status: "pending" },
  { id: 4, patient: "Michael Brown", time: "03:00 PM", type: "Procedure", status: "confirmed" },
];

const vitalStatsData = [
  { name: "Jan", patients: 120, avgBP: "120/80" },
  { name: "Feb", patients: 145, avgBP: "122/82" },
  { name: "Mar", patients: 132, avgBP: "121/81" },
  { name: "Apr", patients: 158, avgBP: "123/83" },
  { name: "May", patients: 167, avgBP: "124/84" },
  { name: "Jun", patients: 142, avgBP: "122/82" },
];

const medications = [
  { id: 1, name: "Lisinopril", dosage: "10mg", frequency: "Daily", prescribed: "Dr. Chen", status: "active" },
  { id: 2, name: "Metformin", dosage: "500mg", frequency: "Twice daily", prescribed: "Dr. Patel", status: "active" },
  { id: 3, name: "Atorvastatin", dosage: "20mg", frequency: "Nightly", prescribed: "Dr. Chen", status: "active" },
  { id: 4, name: "Albuterol", dosage: "Inhaler", frequency: "As needed", prescribed: "Dr. Wilson", status: "active" },
];

export default function HealthcareDashboard() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Healthcare Dashboard</h1>
        <div className="flex gap-2">
          <Button variant="outline">
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Patient
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Patients</CardTitle>
            <Stethoscope className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,248</div>
            <p className="text-xs text-gray-500">+12% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today's Appointments</CardTitle>
            <CalendarDays className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">14</div>
            <p className="text-xs text-gray-500">3 pending confirmation</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Medications Due</CardTitle>
            <Pill className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">23</div>
            <p className="text-xs text-gray-500">5 critical refills</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg. Blood Pressure</CardTitle>
            <Activity className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">122/82</div>
            <p className="text-xs text-gray-500">Normal range</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="md:col-span-4">
          <CardHeader>
            <CardTitle>Patient Statistics</CardTitle>
            <CardDescription>Monthly patient visits and average blood pressure</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={vitalStatsData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" hide />
                <Tooltip />
                <Line yAxisId="left" type="monotone" dataKey="patients" stroke="#8884d8" activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Upcoming Appointments</CardTitle>
            <CardDescription>Today's scheduled appointments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {appointments.map((appointment) => (
                <div key={appointment.id} className="flex items-center">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{appointment.patient}</p>
                    <p className="text-sm text-gray-500">{appointment.time} • {appointment.type}</p>
                  </div>
                  <div className="ml-auto">
                    <Badge variant={appointment.status === "confirmed" ? "default" : "secondary"}>
                      {appointment.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button variant="outline" className="w-full">
              View All Appointments
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Patient Records</CardTitle>
            <CardDescription>Recently active patients</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Last Visit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patientData.map((patient) => (
                  <TableRow key={patient.id}>
                    <TableCell>
                      <div className="flex items-center">
                        <Avatar className="h-8 w-8 mr-2">
                          <AvatarImage src={`/avatars/${patient.id}.png`} />
                          <AvatarFallback>{patient.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{patient.name}</p>
                          <p className="text-sm text-gray-500">Age: {patient.age}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{patient.condition}</TableCell>
                    <TableCell>{patient.lastVisit}</TableCell>
                    <TableCell>
                      <Badge variant={
                        patient.status === "active" ? "default" :
                        patient.status === "follow-up" ? "secondary" :
                        patient.status === "critical" ? "destructive" : "outline"
                      }>
                        {patient.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>View Profile</DropdownMenuItem>
                          <DropdownMenuItem>Medical History</DropdownMenuItem>
                          <DropdownMenuItem>Schedule Visit</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Medication Tracker</CardTitle>
            <CardDescription>Currently prescribed medications</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {medications.map((med) => (
                <div key={med.id} className="flex items-start">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{med.name}</p>
                    <p className="text-sm text-gray-500">{med.dosage} • {med.frequency}</p>
                    <p className="text-xs text-gray-400">Prescribed by {med.prescribed}</p>
                  </div>
                  <Badge variant="outline" className="ml-auto">
                    {med.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full">
              View All Medications
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}