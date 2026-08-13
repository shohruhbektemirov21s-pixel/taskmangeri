"""Kerakli mutaxassisliklar JSON royxatdan alohida jadvalga kochadi.

IBM Db2 Django ning JSON maydonini qollamaydi (`supports_json_field = False`),
shuning uchun `Project.needed_specialties` normal jadvalga chiqarildi.

Tartib muhim: avval jadval yaratiladi, keyin eski JSON ustundagi qiymatlar
kochiriladi, undan keyingina ustun ochiriladi. Aks holda malumot yoqolardi.
"""
import json

import django.db.models.deletion
from django.db import migrations, models


def json_to_rows(apps, schema_editor):
    """Eski JSON royxatni yangi jadvalga kochiradi."""
    Project = apps.get_model("projects", "Project")
    ProjectSpecialty = apps.get_model("projects", "ProjectSpecialty")

    rows, projects = [], 0
    for project in Project.objects.all().iterator():
        values = project.needed_specialties
        # Baza turiga qarab JSON matn bolib kelishi ham mumkin.
        if isinstance(values, str):
            try:
                values = json.loads(values)
            except (TypeError, ValueError):
                values = []
        if not isinstance(values, (list, tuple)):
            continue

        seen = set()
        for value in values:
            value = str(value).strip()
            if value and value not in seen:
                seen.add(value)
                rows.append(ProjectSpecialty(project_id=project.pk, value=value))
        if seen:
            projects += 1

    if rows:
        ProjectSpecialty.objects.bulk_create(rows, ignore_conflicts=True)
        print("\n    {} ta loyihadan {} ta mutaxassislik kochirildi".format(projects, len(rows)))


def rows_to_json(apps, schema_editor):
    """Orqaga qaytarish: jadvaldan yana JSON royxatga."""
    Project = apps.get_model("projects", "Project")
    ProjectSpecialty = apps.get_model("projects", "ProjectSpecialty")

    grouped = {}
    for row in ProjectSpecialty.objects.all().iterator():
        grouped.setdefault(row.project_id, []).append(row.value)

    for project_id, values in grouped.items():
        Project.objects.filter(pk=project_id).update(needed_specialties=sorted(values))


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0005_projectfile'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProjectSpecialty',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('value', models.CharField(db_index=True, max_length=20, verbose_name='Mutaxassislik')),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='specialties', to='projects.project')),
            ],
            options={
                'verbose_name': 'Kerakli mutaxassislik',
                'verbose_name_plural': 'Kerakli mutaxassisliklar',
                'ordering': ['value'],
                'unique_together': {('project', 'value')},
            },
        ),
        migrations.RunPython(json_to_rows, rows_to_json),
        migrations.RemoveField(
            model_name='project',
            name='needed_specialties',
        ),
    ]
