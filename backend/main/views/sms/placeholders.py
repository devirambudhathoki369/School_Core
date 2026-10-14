# MENTIONED FROM frontend/src/components/views/communication/sms/templates/PlaceValues > OPTIONS > value[]
Student_Name_PH = "{{student-name}}"
Guardian_Name_PH = "{{guardian-name}}"
Class_Name_PH = "{{class-name}}"
Paid_Amount_PH = "{{paid-amount}}"
Balance_Amount_PH = "{{balance-amount}}"
BIRTH_DATE_PH = "{{birth-date}}"

# Staff-side placeholders — used by the staff bulk SMS and the staff birthday
# wish. `{{staff-name}}` resolves from the same annotated `name` as the student
# one does, so a template written with either reads the row it was given.
Staff_Name_PH = "{{staff-name}}"
Designation_PH = "{{designation}}"
