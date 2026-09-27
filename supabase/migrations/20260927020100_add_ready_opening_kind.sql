-- إضافة نوع الرصيد الافتتاحي للجاهز للبيع.
-- منفصل عن تعديل البنية لأن PostgreSQL يشترط تثبيت قيمة التعداد قبل استخدامها في نفس قاعدة البيانات.
alter type public.opening_balance_kind add value if not exists 'ready';
